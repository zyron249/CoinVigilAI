import pytest

from app.models import MarketAsset
from app.services.ask import ADVICE_RE, answer_ask, heuristic_answer, resolve_coin_id
from app.services.market import DEMO_MARKETS


def _quote(asset: MarketAsset, source="coingecko"):
    return {
        "id": asset.id,
        "symbol": asset.symbol.upper(),
        "name": asset.name,
        "price_usd": asset.current_price,
        "change_24h": asset.price_change_percentage_24h,
        "market_cap": asset.market_cap,
        "volume_24h": asset.total_volume,
        "source": source,
    }


def test_advice_regex_catches_buy_sell_and_predictions():
    assert ADVICE_RE.search("Should I buy bitcoin")
    assert ADVICE_RE.search("predict the price target")
    assert not ADVICE_RE.search("What is bitcoin's price")


def test_resolve_coin_from_symbol_and_name():
    assets = [_quote(asset) for asset in DEMO_MARKETS]
    assert resolve_coin_id("how is eth doing", assets, None) == "ethereum"
    assert resolve_coin_id("bitcoin dominance", assets, None) == "bitcoin"
    assert resolve_coin_id("anything", assets, "solana") == "solana"


def test_heuristic_answer_copies_tool_price_and_refuses_advice():
    btc = DEMO_MARKETS[0]
    facts = {
        "quote": _quote(btc, "demo"),
        "screen": {"source": "demo", "assets": [_quote(btc, "demo")]},
        "news": {"items": [{"title": "Fixture headline", "source": "Test RSS", "url": "https://example.com/a"}]},
    }
    text = heuristic_answer("should I buy", facts, refused=True, insight=True)
    assert "does not give buy/sell" in text.lower()
    assert str(int(btc.current_price)) in text.replace(",", "") or f"{btc.current_price:,.2f}" in text
    assert "demo" in text.lower()
    assert "fixture headline" in text.lower()
    assert "not invented" in text.lower() or "rss" in text.lower()


@pytest.mark.asyncio
async def test_ask_uses_tools_without_inventing_when_no_keys(monkeypatch):
    from app.models import RankedMarkets

    async def fake_ranked(**kwargs):
        return RankedMarkets(
            data=list(DEMO_MARKETS[:3]),
            count=3,
            page=1,
            limit=8,
            total=3,
            sort="market_cap",
            order="desc",
            source="demo",
            universe_size=3,
            partial=False,
        )

    async def fake_asset(coin_id: str):
        for asset in DEMO_MARKETS:
            if asset.id == coin_id or asset.symbol.lower() == coin_id.lower():
                return asset, "demo"
        return None, "unavailable"

    async def fake_news(limit=5):
        return [{"title": "Demo RSS only", "link": "https://example.com/n", "source": "Fixture", "published_at": "2026-09-21T00:00:00Z"}]

    monkeypatch.setattr("app.services.ask.get_ranked_markets", fake_ranked)
    monkeypatch.setattr("app.services.ask.get_asset_with_source", fake_asset)
    monkeypatch.setattr("app.services.ask.get_news", fake_news)
    result = await answer_ask("What is bitcoin's price?")
    assert result.generated is False
    assert result.engine == "heuristic-tools"
    assert "screen_markets" in result.tools_used
    assert "get_asset_quote" in result.tools_used
    assert "get_news" in result.tools_used
    assert result.coin_id == "bitcoin"
    assert result.interacting_with_ai is True
    assert "not financial advice" in result.disclaimer.lower()
    assert "interacting with" in result.disclaimer.lower()
    dumped = result.answer.lower()
    assert "bitcoin" in dumped
    assert result.quotes and result.quotes[0]["id"] == "bitcoin"
    assert result.quotes[0]["price_usd"] == DEMO_MARKETS[0].current_price


@pytest.mark.asyncio
async def test_ask_routes_named_asset_even_with_extra_tokens(monkeypatch):
    from app.models import RankedMarkets

    uni = DEMO_MARKETS[0].model_copy(update={
        "id": "uniswap",
        "symbol": "uni",
        "name": "Uniswap",
        "current_price": 12.5,
        "market_cap": 9_000_000_000,
        "total_volume": 400_000_000,
        "price_change_percentage_24h": 3.2,
    })

    async def fake_ranked(**kwargs):
        query = (kwargs.get("query") or "").lower()
        data = [uni] if "uniswap" in query or query == "uni" else list(DEMO_MARKETS[:2])
        return RankedMarkets(
            data=data,
            count=len(data),
            page=1,
            limit=8,
            total=len(data),
            sort="market_cap",
            order="desc",
            source="demo",
            universe_size=len(data),
        )

    async def fake_asset(coin_id: str):
        if coin_id.lower() in {"uniswap", "uni"}:
            return uni, "demo"
        for asset in DEMO_MARKETS:
            if asset.id == coin_id or asset.symbol.lower() == coin_id.lower():
                return asset, "demo"
        return None, "unavailable"

    async def fake_news(limit=5):
        return []

    monkeypatch.setattr("app.services.ask.get_ranked_markets", fake_ranked)
    monkeypatch.setattr("app.services.ask.get_asset_with_source", fake_asset)
    monkeypatch.setattr("app.services.ask.get_news", fake_news)
    result = await answer_ask("What is uniswap doing today?")
    assert result.coin_id == "uniswap"
    assert "get_asset_quote" in result.tools_used
    assert "12.5" in result.answer.replace(",", "") or "12.50" in result.answer
    assert result.generated is False


@pytest.mark.asyncio
async def test_ask_refuses_trade_advice_still_returns_tool_quote(monkeypatch):
    from app.models import RankedMarkets

    async def fake_ranked(**kwargs):
        return RankedMarkets(
            data=list(DEMO_MARKETS[:2]),
            count=2,
            page=1,
            limit=8,
            total=2,
            sort="market_cap",
            order="desc",
            source="demo",
            universe_size=2,
        )

    async def fake_asset(coin_id: str):
        return DEMO_MARKETS[0], "demo"

    async def fake_news(limit=5):
        return []

    monkeypatch.setattr("app.services.ask.get_ranked_markets", fake_ranked)
    monkeypatch.setattr("app.services.ask.get_asset_with_source", fake_asset)
    monkeypatch.setattr("app.services.ask.get_news", fake_news)
    result = await answer_ask("Should I buy bitcoin")
    assert result.refused_advice is True
    assert "buy/sell" in result.answer.lower()
    assert result.generated is False


@pytest.mark.asyncio
async def test_ask_generic_prompt_keeps_unfiltered_market_screen(monkeypatch):
    from app.models import RankedMarkets

    seen = []

    async def fake_ranked(**kwargs):
        seen.append(kwargs.get("query"))
        return RankedMarkets(
            data=list(DEMO_MARKETS[:3]),
            count=3,
            page=1,
            limit=8,
            total=3,
            sort="market_cap",
            order="desc",
            source="demo",
            universe_size=3,
        )

    async def fake_asset(coin_id: str):
        return None, "unavailable"

    async def fake_news(limit=5):
        return []

    monkeypatch.setattr("app.services.ask.get_ranked_markets", fake_ranked)
    monkeypatch.setattr("app.services.ask.get_asset_with_source", fake_asset)
    monkeypatch.setattr("app.services.ask.get_news", fake_news)
    result = await answer_ask("Show market leaders")
    assert seen and seen[0] in {None, ""}
    assert "bitcoin" in result.answer.lower()
    assert result.generated is False
