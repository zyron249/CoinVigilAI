from fastapi.testclient import TestClient

from app.main import app
from app.models import GlobalOverview, MarketBrief, MarketMovers, RankedMarkets
from app.services.market import DEMO_MARKETS


client = TestClient(app)


def test_health_reports_ok_and_honest_dependencies():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["dependencies"]["postgres"] == "not_provisioned"
    assert body["dependencies"]["market_provider"] == "coingecko"
    assert "redis" in body["dependencies"]
    assert body["status_url"] == "/api/status"


def test_public_status_has_no_secrets_and_no_postgres():
    response = client.get("/api/status")
    assert response.status_code == 200
    body = response.json()
    dumped = str(body).lower()
    assert body["postgres"] == "not_provisioned"
    assert body["market"]["provider"] == "coingecko"
    assert body["market"]["observed"] is False
    assert body["market"]["source"] is None
    assert "not financial advice" in body["disclaimer"].lower()
    assert "sk-" not in dumped
    assert "xai-" not in dumped
    assert "api_key" not in dumped
    assert body["ai"]["configured"] == []
    assert body["ai"]["configured_count"] == 0
    assert isinstance(body["news"]["hosts"], list)
    assert body["market"]["key_configured"] is False


def test_public_status_reports_observed_demo_without_calling_markets(monkeypatch):
    async def fake_peek():
        return {
            "source": "demo",
            "stale": False,
            "last_live_at": None,
            "fallback_reason": "rate_limited",
            "observed": True,
        }

    monkeypatch.setattr("app.main.peek_universe_status", fake_peek)
    response = client.get("/api/status")
    assert response.status_code == 200
    body = response.json()
    dumped = str(body).lower()
    assert body["market"]["source"] == "demo"
    assert body["market"]["observed"] is True
    assert body["market"]["fallback_reason"] == "rate_limited"
    assert "sk-" not in dumped
    assert "api_key" not in dumped


def test_council_status_lists_supported_providers():
    response = client.get("/api/ai/council/status")
    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is True
    assert body["supported"] >= 9
    assert body["configured"] == 0


def test_news_empty_without_rss_config():
    response = client.get("/api/news")
    assert response.status_code == 200
    body = response.json()
    assert body["data"] == []
    assert body["configured"] is False
    assert body["using_defaults"] is False
    assert "NEWS_RSS_URLS" in body["message"]


def test_candles_report_snapped_coingecko_days(monkeypatch):
    async def fake_candles(coin_id: str, days: int = 90):
        from app.models import Candle
        return [Candle(timestamp=1, open=1, high=2, low=0.5, close=1.2)], "demo"

    monkeypatch.setattr("app.main.get_candles", fake_candles)
    response = client.get("/api/assets/bitcoin/candles?days=45")
    assert response.status_code == 200
    body = response.json()
    assert body["days"] == 30
    assert body["source"] == "demo"
    assert body["count"] == 1


def test_tickers_endpoint_never_invents_pairs(monkeypatch):
    from app.models import AssetTickers

    async def fake_tickers(coin_id: str, page: int = 1, limit: int = 25, **_kwargs):
        return AssetTickers(
            coin_id=coin_id,
            data=[],
            count=0,
            page=page,
            limit=limit,
            total=0,
            source="demo",
            note="Exchange listings are hidden in the labeled demo snapshot — pairs are never invented.",
        )

    monkeypatch.setattr("app.main.get_asset_tickers", fake_tickers)
    response = client.get("/api/assets/bitcoin/tickers")
    assert response.status_code == 200
    body = response.json()
    assert body["data"] == []
    assert body["source"] == "demo"
    assert "invent" in body["note"].lower()
    dumped = str(body).lower()
    assert "api_key" not in dumped


def test_profile_endpoint_never_invents_urls(monkeypatch):
    from app.models import AssetProfile

    async def fake_profile(coin_id: str):
        return AssetProfile(
            coin_id=coin_id,
            links=[],
            categories=[],
            description=None,
            source="demo",
            note="Project links are hidden in the labeled demo snapshot — URLs are never invented or scraped.",
        )

    monkeypatch.setattr("app.main.get_asset_profile", fake_profile)
    response = client.get("/api/assets/bitcoin/profile")
    assert response.status_code == 200
    body = response.json()
    assert body["links"] == []
    assert body["source"] == "demo"
    assert "invent" in body["note"].lower()
    dumped = str(body).lower()
    assert "api_key" not in dumped
    assert "javascript:" not in dumped


def test_market_source_is_exposed(monkeypatch):
    async def fake_ranked(limit=50, page=1, sort="market_cap", order="desc", query=None):
        rows = DEMO_MARKETS[:limit]
        return RankedMarkets(
            data=rows,
            count=len(rows),
            page=page,
            limit=limit,
            total=len(DEMO_MARKETS),
            sort=sort,
            order=order,
            source="demo",
            universe_size=len(DEMO_MARKETS),
        )

    monkeypatch.setattr("app.main.get_ranked_markets", fake_ranked)
    response = client.get("/api/market?limit=2")
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "demo"
    assert body["count"] == 2
    assert body["data"][0]["id"] == "bitcoin"
    assert body["page"] == 1
    assert body["sort"] == "market_cap"


def test_global_endpoint_exposes_source(monkeypatch):
    async def fake_global():
        return GlobalOverview(
            total_market_cap_usd=100,
            total_volume_24h_usd=10,
            btc_dominance=50,
            source="demo",
            coverage="universe",
            note="Demo snapshot totals across the labeled fallback universe.",
        )

    monkeypatch.setattr("app.main.get_global_overview", fake_global)
    response = client.get("/api/market/global")
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "demo"
    assert body["coverage"] == "universe"
    assert body["fear_greed_value"] is None
    assert "demo" in body["note"].lower()


def test_movers_endpoint_exposes_source(monkeypatch):
    async def fake_movers(limit=5):
        return MarketMovers(gainers=DEMO_MARKETS[:1], losers=DEMO_MARKETS[-1:], count=1, source="cache")

    monkeypatch.setattr("app.main.get_movers", fake_movers)
    response = client.get("/api/market/movers?limit=1")
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "cache"
    assert body["gainers"][0]["id"] == "bitcoin"
    assert body["losers"][0]["id"] == DEMO_MARKETS[-1].id


def test_brief_endpoint_is_labeled_not_advice(monkeypatch):
    async def fake_brief():
        return MarketBrief(
            headline="Range-bound snapshot",
            tone="neutral",
            summary="Heuristic tone is neutral on a demo snapshot.",
            bullets=["Demo snapshot, not live prices."],
            engine="heuristic",
            generated=False,
            data_source="demo",
        )

    monkeypatch.setattr("app.main.build_market_brief", fake_brief)
    response = client.get("/api/market/brief")
    assert response.status_code == 200
    body = response.json()
    assert body["data_source"] == "demo"
    assert body["engine"] == "heuristic"
    assert body["generated"] is False
    assert "not financial advice" in body["disclaimer"].lower()


def test_news_configured_empty_explains_failure(monkeypatch):
    async def fake_news(limit=20):
        return []

    class FakeSettings:
        rss_urls = ["https://example.test/rss"]
        using_default_rss = False
        rss_hosts = ["example.test"]

    monkeypatch.setattr("app.main.get_news", fake_news)
    monkeypatch.setattr("app.main.get_settings", lambda: FakeSettings())
    response = client.get("/api/news")
    assert response.status_code == 200
    body = response.json()
    assert body["configured"] is True
    assert body["data"] == []
    assert "did not return stories" in body["message"]


def test_compare_endpoint_caps_and_never_invents(monkeypatch):
    from app.models import AssetCompare, MarketAsset

    async def fake_compare(ids: str | None = None):
        return AssetCompare(
            ids=["bitcoin", "ethereum", "not-a-real-coin"],
            data=[
                MarketAsset(id="bitcoin", symbol="btc", name="Bitcoin", current_price=1),
                MarketAsset(id="ethereum", symbol="eth", name="Ethereum", current_price=2),
            ],
            missing=["not-a-real-coin"],
            count=2,
            source="demo",
            note="Missing ids are omitted rather than invented.",
        )

    monkeypatch.setattr("app.main.compare_assets", fake_compare)
    response = client.get("/api/compare?ids=bitcoin,ethereum,not-a-real-coin,dogecoin")
    assert response.status_code == 200
    body = response.json()
    assert [row["id"] for row in body["data"]] == ["bitcoin", "ethereum"]
    assert body["missing"] == ["not-a-real-coin"]
    assert "invent" in body["note"].lower()
    dumped = str(body).lower()
    assert "api_key" not in dumped
    assert "coinmarketcap" not in dumped


def test_ask_endpoint_is_tool_grounded_and_labeled_ai(monkeypatch):
    from app.models import AskAnswer, AskCitation

    async def fake_ask(question: str, coin_id: str | None = None, insight: bool = False):
        return AskAnswer(
            question=question,
            answer="Bitcoin is $1.00 in this demo snapshot.",
            engine="heuristic-tools",
            generated=False,
            tools_used=["screen_markets", "get_asset_quote", "get_news"],
            citations=[AskCitation(kind="quote", label="Bitcoin quote", detail="demo")],
            quotes=[{"id": "bitcoin", "price_usd": 1, "source": "demo"}],
            data_source="demo",
            coin_id="bitcoin",
        )

    monkeypatch.setattr("app.main.answer_ask", fake_ask)
    response = client.post("/api/ai/ask", json={"question": "What is bitcoin's price?"})
    assert response.status_code == 200
    body = response.json()
    assert body["interacting_with_ai"] is True
    assert body["generated"] is False
    assert "get_asset_quote" in body["tools_used"]
    assert "not financial advice" in body["disclaimer"].lower()
    assert "interacting with" in body["disclaimer"].lower()
    dumped = str(body).lower()
    assert "api_key" not in dumped


def test_convert_endpoint_uses_query_aliases(monkeypatch):
    from app.models import ConvertQuote

    async def fake_convert(amount: float, from_id: str, to_id: str):
        return ConvertQuote(
            amount=amount,
            from_id=from_id,
            from_symbol="BTC",
            from_name="Bitcoin",
            from_price_usd=100,
            to_id=to_id,
            to_symbol="USD",
            to_name="US Dollar",
            to_price_usd=1,
            value=amount * 100,
            rate=100,
            source="demo",
            note="Demo conversion — not invented.",
        )

    monkeypatch.setattr("app.main.convert_quote", fake_convert)
    response = client.get("/api/convert?from=bitcoin&to=usd&amount=2")
    assert response.status_code == 200
    body = response.json()
    assert body["value"] == 200
    assert body["from_id"] == "bitcoin"
    assert "invent" in body["note"].lower()
    assert "not financial advice" in body["disclaimer"].lower()

