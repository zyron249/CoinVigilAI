import httpx
import pytest

from app.models import MarketAsset
from app.services.market import (
    DEMO_MARKETS,
    get_asset,
    get_candles,
    get_global_overview,
    get_market_universe,
    get_markets_with_source,
    get_movers,
    get_ranked_markets,
    market_asset_from_payload,
    peek_universe_status,
    save_last_good,
    snap_ohlc_days,
)


class _FailingClient:
    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, *args, **kwargs):
        raise RuntimeError("offline")


def test_ohlc_days_snap_to_coingecko_enum():
    assert snap_ohlc_days(45) == 30
    assert snap_ohlc_days(7) == 7
    assert snap_ohlc_days(1) == 1
    assert snap_ohlc_days(400) == 365
    assert snap_ohlc_days(0) == 1


@pytest.mark.asyncio
async def test_peek_universe_status_never_calls_coingecko(monkeypatch):
    monkeypatch.setattr("app.services.market.httpx.AsyncClient", _FailingClient)
    monkeypatch.setattr("app.services.market.cache_get", _noop_cache_get)
    empty = await peek_universe_status()
    assert empty["observed"] is False
    assert empty["source"] is None

    await save_last_good("universe", {
        "items": [DEMO_MARKETS[0].model_dump()],
        "source": "coingecko",
        "last_live_at": "2026-09-20T04:00:00Z",
    })
    observed = await peek_universe_status()
    assert observed["observed"] is True
    assert observed["source"] == "cache"
    assert observed["stale"] is True
    assert observed["last_live_at"] == "2026-09-20T04:00:00Z"


def test_parses_coingecko_percentage_aliases():
    asset = market_asset_from_payload({
        "id": "bitcoin",
        "symbol": "btc",
        "name": "Bitcoin",
        "current_price": 1,
        "market_cap": 10,
        "market_cap_rank": 1,
        "total_volume": 2,
        "price_change_percentage_1h_in_currency": 0.5,
        "price_change_percentage_24h": 1.2,
        "price_change_percentage_7d_in_currency": -3.4,
        "circulating_supply": 19_000_000,
        "sparkline_in_7d": {"price": [1.0, 1.1, 1.05]},
    })
    assert asset.price_change_percentage_1h == 0.5
    assert asset.price_change_percentage_24h == 1.2
    assert asset.price_change_percentage_7d == -3.4
    assert asset.circulating_supply == 19_000_000
    assert asset.sparkline_7d == [1.0, 1.1, 1.05]


def test_parses_ath_fields():
    asset = market_asset_from_payload({
        "id": "bitcoin",
        "symbol": "btc",
        "name": "Bitcoin",
        "ath": 69000,
        "ath_change_percentage": -12.5,
        "ath_date": "2021-11-10T14:00:00.000Z",
        "atl": 67,
        "atl_change_percentage": 90000,
        "atl_date": "2013-07-05T00:00:00.000Z",
    })
    assert asset.ath == 69000
    assert asset.ath_change_percentage == -12.5
    assert asset.atl == 67


def test_ticker_payload_requires_exchange_and_pair():
    from app.services.market import ticker_from_payload
    assert ticker_from_payload({}) is None
    ticker = ticker_from_payload({
        "base": "btc",
        "target": "usdt",
        "market": {"name": "Binance", "identifier": "binance"},
        "converted_last": {"usd": 64000},
        "converted_volume": {"usd": 1_000_000},
        "trust_score": "green",
        "trade_url": "https://www.binance.com/en/trade/BTC_USDT",
    })
    assert ticker is not None
    assert ticker.exchange == "Binance"
    assert ticker.pair == "BTC/USDT"
    assert ticker.volume_usd == 1_000_000
    assert ticker.trade_url.startswith("https://")


@pytest.mark.asyncio
async def test_tickers_do_not_invent_pairs_when_offline(monkeypatch):
    from app.services.market import get_asset_tickers
    monkeypatch.setattr("app.services.market.httpx.AsyncClient", _FailingClient)
    monkeypatch.setattr("app.services.market.cache_get", _noop_cache_get)
    page = await get_asset_tickers("bitcoin", page=1, limit=25)
    assert page.data == []
    assert page.source in {"demo", "unavailable"}
    assert "invent" in page.note.lower()


@pytest.mark.asyncio
async def test_tickers_sort_by_volume_and_keep_source(monkeypatch):
    from app.services.market import get_asset_tickers

    class _TickerClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def get(self, url, params=None):
            request = httpx.Request("GET", str(url))
            return httpx.Response(200, json={
                "tickers": [
                    {
                        "base": "BTC",
                        "target": "USD",
                        "market": {"name": "Coinbase Exchange", "identifier": "gdax"},
                        "converted_last": {"usd": 63900},
                        "converted_volume": {"usd": 100},
                        "trust_score": "green",
                        "trade_url": "https://www.coinbase.com",
                    },
                    {
                        "base": "BTC",
                        "target": "USDT",
                        "market": {"name": "Binance", "identifier": "binance"},
                        "converted_last": {"usd": 64000},
                        "converted_volume": {"usd": 900},
                        "trust_score": "green",
                        "trade_url": "https://www.binance.com/en/trade/BTC_USDT",
                    },
                ]
            }, request=request)

    monkeypatch.setattr("app.services.market.httpx.AsyncClient", _TickerClient)
    monkeypatch.setattr("app.services.market.cache_get", _noop_cache_get)
    monkeypatch.setattr("app.services.market.cache_set", _noop_cache_set)
    page = await get_asset_tickers("bitcoin", page=1, limit=25)
    assert page.source == "coingecko"
    assert [row.exchange for row in page.data] == ["Binance", "Coinbase Exchange"]
    assert page.unique_exchange_count == 2
    assert page.venues[0] == "Binance"
    assert "scrape" in page.note.lower()


def _market_stub(coin_id: str, rank: int) -> dict:
    return {
        "id": coin_id,
        "symbol": coin_id[:3],
        "name": coin_id.replace("-", " ").title(),
        "current_price": rank,
        "market_cap": 1_000_000 - rank,
        "market_cap_rank": rank,
        "total_volume": 50,
    }


@pytest.mark.asyncio
async def test_markets_concatenates_paginated_coingecko_pages(monkeypatch):
    from app.services.market import get_ranked_markets

    class _PagedMarketsClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def get(self, url, params=None):
            page = int((params or {}).get("page") or 1)
            request = httpx.Request("GET", str(url))
            if page == 1:
                payload = [_market_stub("bitcoin", 1), _market_stub("ethereum", 2)]
            elif page == 2:
                payload = [_market_stub("solana", 3)]
            else:
                payload = []
            return httpx.Response(200, json=payload, request=request)

    monkeypatch.setattr("app.services.market.MARKET_UNIVERSE_LIMIT", 2)
    monkeypatch.setattr("app.services.market.MARKET_UNIVERSE_PAGES", 3)
    monkeypatch.setattr("app.services.market.httpx.AsyncClient", _PagedMarketsClient)
    monkeypatch.setattr("app.services.market.cache_get", _noop_cache_get)
    monkeypatch.setattr("app.services.market.cache_set", _noop_cache_set)
    page = await get_ranked_markets(limit=10, page=1, sort="market_cap", order="desc")
    assert page.source == "coingecko"
    assert [asset.id for asset in page.data] == ["bitcoin", "ethereum", "solana"]
    assert page.universe_size == 3
    assert "paginated /coins/markets" in page.coverage_note
    assert "coingecko-tracked" in page.coverage_note.lower()


@pytest.mark.asyncio
async def test_tickers_concatenates_coingecko_pages(monkeypatch):
    from app.services.market import get_asset_tickers

    class _PagedTickerClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def get(self, url, params=None):
            page = int((params or {}).get("page") or 1)
            request = httpx.Request("GET", str(url))
            if page == 1:
                tickers = [
                    {
                        "base": "BTC",
                        "target": "USDT",
                        "market": {"name": "Binance", "identifier": "binance"},
                        "converted_last": {"usd": 64000},
                        "converted_volume": {"usd": 900},
                        "trust_score": "green",
                    },
                    {
                        "base": "BTC",
                        "target": "USD",
                        "market": {"name": "Coinbase Exchange", "identifier": "gdax"},
                        "converted_last": {"usd": 63900},
                        "converted_volume": {"usd": 100},
                        "trust_score": "green",
                    },
                ]
            elif page == 2:
                tickers = [
                    {
                        "base": "BTC",
                        "target": "USD",
                        "market": {"name": "Kraken", "identifier": "kraken"},
                        "converted_last": {"usd": 63800},
                        "converted_volume": {"usd": 50},
                        "trust_score": "yellow",
                    },
                ]
            else:
                tickers = []
            return httpx.Response(200, json={"tickers": tickers}, request=request)

    monkeypatch.setattr("app.services.market.TICKER_PAGE_SIZE", 2)
    monkeypatch.setattr("app.services.market.TICKER_SOURCE_PAGES", 3)
    monkeypatch.setattr("app.services.market.httpx.AsyncClient", _PagedTickerClient)
    monkeypatch.setattr("app.services.market.cache_get", _noop_cache_get)
    monkeypatch.setattr("app.services.market.cache_set", _noop_cache_set)
    page = await get_asset_tickers("bitcoin", page=1, limit=25)
    assert [row.exchange for row in page.data] == ["Binance", "Coinbase Exchange", "Kraken"]
    assert page.unique_exchange_count == 3
    assert page.total == 3
    assert "venues" in page.note.lower()


@pytest.mark.asyncio
async def test_markets_fall_back_to_demo(monkeypatch):
    monkeypatch.setattr("app.services.market.httpx.AsyncClient", _FailingClient)
    assets, source = await get_markets_with_source(2)
    assert source == "demo"
    assert [asset.id for asset in assets] == ["bitcoin", "ethereum"]
    assert all(asset.sparkline_7d for asset in assets)


@pytest.mark.asyncio
async def test_ranked_markets_sort_and_paginate_demo(monkeypatch):
    monkeypatch.setattr("app.services.market.httpx.AsyncClient", _FailingClient)
    page = await get_ranked_markets(limit=3, page=1, sort="change_24h", order="desc")
    assert page.source == "demo"
    assert page.page == 1
    assert page.limit == 3
    assert page.total == len(DEMO_MARKETS)
    changes = [asset.price_change_percentage_24h or 0 for asset in page.data]
    assert changes == sorted(changes, reverse=True)

    page_two = await get_ranked_markets(limit=3, page=2, sort="change_24h", order="desc")
    assert page_two.source == "demo"
    assert page_two.data
    assert {asset.id for asset in page.data}.isdisjoint({asset.id for asset in page_two.data})


@pytest.mark.asyncio
async def test_ranked_search_filters_demo_universe(monkeypatch):
    monkeypatch.setattr("app.services.market.httpx.AsyncClient", _FailingClient)
    page = await get_ranked_markets(limit=10, page=1, sort="market_cap", order="desc", query="bit")
    assert page.query == "bit"
    assert page.data
    assert all("bit" in asset.id or "bit" in asset.symbol.lower() or "bit" in asset.name.lower() for asset in page.data)
    assert "demo snapshot" in page.coverage_note.lower()
    assert "coinmarketcap" in page.coverage_note.lower()


@pytest.mark.asyncio
async def test_unknown_sort_falls_back_to_market_cap(monkeypatch):
    monkeypatch.setattr("app.services.market.httpx.AsyncClient", _FailingClient)
    page = await get_ranked_markets(limit=8, page=1, sort="not-a-column", order="sideways")
    assert page.sort == "market_cap"
    assert page.order == "desc"
    assert page.data[0].id == "bitcoin"


@pytest.mark.asyncio
async def test_cache_source_is_labeled(monkeypatch):
    async def fake_get(key):
        return [DEMO_MARKETS[0].model_dump()]

    monkeypatch.setattr("app.services.market.cache_get", fake_get)
    assets, source = await get_markets_with_source(1)
    assert source == "cache"
    assert assets[0].id == "bitcoin"


@pytest.mark.asyncio
async def test_global_demo_does_not_invent_fear_greed(monkeypatch):
    monkeypatch.setattr("app.services.market.httpx.AsyncClient", _FailingClient)
    overview = await get_global_overview()
    assert overview.source == "demo"
    assert overview.coverage == "universe"
    assert overview.fallback_reason == "unreachable"
    assert overview.fear_greed_value is None
    assert overview.fear_greed_classification is None
    expected_cap = sum(asset.market_cap or 0 for asset in DEMO_MARKETS)
    assert overview.total_market_cap_usd == expected_cap
    assert overview.btc_dominance is not None
    assert "demo" in (overview.note or "").lower()


@pytest.mark.asyncio
async def test_movers_use_24h_change_and_honest_source(monkeypatch):
    monkeypatch.setattr("app.services.market.httpx.AsyncClient", _FailingClient)
    movers = await get_movers(3)
    assert movers.source == "demo"
    assert movers.gainers
    assert movers.losers
    gainer_changes = [asset.price_change_percentage_24h or 0 for asset in movers.gainers]
    loser_changes = [asset.price_change_percentage_24h or 0 for asset in movers.losers]
    assert gainer_changes == sorted(gainer_changes, reverse=True)
    assert loser_changes == sorted(loser_changes)
    assert all(change > 0 for change in gainer_changes)
    assert all(change < 0 for change in loser_changes)
    assert {asset.id for asset in movers.gainers}.isdisjoint({asset.id for asset in movers.losers})
    assert movers.gainers[0].price_change_percentage_24h >= movers.losers[0].price_change_percentage_24h


@pytest.mark.asyncio
async def test_asset_lookup_uses_demo_when_remote_fails(monkeypatch):
    monkeypatch.setattr("app.services.market.httpx.AsyncClient", _FailingClient)
    asset = await get_asset("sol")
    assert asset is not None
    assert asset.id == "solana"
    assert asset.price_change_percentage_7d is not None


@pytest.mark.asyncio
async def test_unknown_asset_is_none_in_demo_mode(monkeypatch):
    monkeypatch.setattr("app.services.market.httpx.AsyncClient", _FailingClient)
    assert await get_asset("not-a-real-coin") is None


@pytest.mark.asyncio
async def test_candles_demo_fallback(monkeypatch):
    monkeypatch.setattr("app.services.market.httpx.AsyncClient", _FailingClient)
    candles, source = await get_candles("bitcoin", 90)
    assert source == "demo"
    assert candles
    assert candles[0].high >= candles[0].low


def test_demo_universe_stays_small_and_labeled():
    ids = {asset.id for asset in DEMO_MARKETS}
    assert {"bitcoin", "ethereum", "solana"} <= ids
    assert len(DEMO_MARKETS) <= 10
    assert all(isinstance(asset, MarketAsset) for asset in DEMO_MARKETS)
    assert all(asset.sparkline_7d for asset in DEMO_MARKETS)


@pytest.mark.asyncio
async def test_ranked_markets_page_past_end_is_empty(monkeypatch):
    monkeypatch.setattr("app.services.market.httpx.AsyncClient", _FailingClient)
    page = await get_ranked_markets(limit=50, page=8, sort="market_cap", order="desc")
    assert page.source == "demo"
    assert page.total == len(DEMO_MARKETS)
    assert page.data == []
    assert page.page == 8


@pytest.mark.asyncio
async def test_ranked_markets_name_sort_is_alphabetical(monkeypatch):
    monkeypatch.setattr("app.services.market.httpx.AsyncClient", _FailingClient)
    page = await get_ranked_markets(limit=20, page=1, sort="name", order="asc")
    names = [asset.name.lower() for asset in page.data]
    assert names == sorted(names)
    assert page.sort == "name"
    assert page.order == "asc"


@pytest.mark.asyncio
async def test_movers_limit_does_not_force_flat_assets_into_losers(monkeypatch):
    monkeypatch.setattr("app.services.market.httpx.AsyncClient", _FailingClient)
    movers = await get_movers(5)
    assert all((asset.price_change_percentage_24h or 0) < 0 for asset in movers.losers)
    assert "binancecoin" not in {asset.id for asset in movers.losers}


class _GlobalClient:
    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, url, params=None, **kwargs):
        class Response:
            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "data": {
                        "total_market_cap": {"usd": 2_500_000_000_000},
                        "total_volume": {"usd": 88_000_000_000},
                        "market_cap_change_percentage_24h_usd": 1.5,
                        "market_cap_percentage": {"btc": 53.2, "eth": 17.1},
                        "active_cryptocurrencies": 13450,
                        "updated_at": 1710000000,
                    }
                }

        return Response()


@pytest.mark.asyncio
async def test_global_coingecko_payload_is_labeled_without_invented_fng(monkeypatch):
    async def no_cache(_key):
        return None

    async def no_set(*_args, **_kwargs):
        return None

    monkeypatch.setattr("app.services.market.cache_get", no_cache)
    monkeypatch.setattr("app.services.market.cache_set", no_set)
    monkeypatch.setattr("app.services.market.httpx.AsyncClient", _GlobalClient)
    overview = await get_global_overview()
    assert overview.source == "coingecko"
    assert overview.coverage == "global"
    assert overview.total_market_cap_usd == 2_500_000_000_000
    assert overview.total_volume_24h_usd == 88_000_000_000
    assert overview.market_cap_change_percentage_24h_usd == 1.5
    assert overview.btc_dominance == 53.2
    assert overview.eth_dominance == 17.1
    assert overview.fear_greed_value is None
    assert overview.fear_greed_classification is None
    assert "coingecko" in (overview.note or "").lower()
    assert overview.source != "coinmarketcap"


@pytest.mark.asyncio
async def test_universe_memory_cache_avoids_second_http(monkeypatch):
    calls = {"n": 0}

    class CountingClient(_FailingClient):
        async def get(self, *args, **kwargs):
            calls["n"] += 1
            raise RuntimeError("offline")

    monkeypatch.setattr("app.services.market.httpx.AsyncClient", CountingClient)
    first_assets, first_source = await get_market_universe()
    second_assets, second_source = await get_market_universe()
    assert first_source == second_source == "demo"
    assert [asset.id for asset in first_assets] == [asset.id for asset in second_assets]
    assert calls["n"] == 1


class _RateLimitClient:
    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def get(self, *args, **kwargs):
        request = httpx.Request("GET", "https://api.coingecko.com/api/v3/coins/markets")
        response = httpx.Response(429, request=request)
        raise httpx.HTTPStatusError("Too Many Requests", request=request, response=response)


async def _noop_cache_get(_key):
    return None


async def _noop_cache_set(*_args, **_kwargs):
    return None


@pytest.mark.asyncio
async def test_rate_limit_uses_last_good_snapshot(monkeypatch):
    monkeypatch.setattr("app.services.market.cache_get", _noop_cache_get)
    monkeypatch.setattr("app.services.market.cache_set", _noop_cache_set)
    await save_last_good("universe", {
        "items": [DEMO_MARKETS[0].model_dump()],
        "source": "coingecko",
        "last_live_at": "2026-09-20T04:00:00Z",
    })
    monkeypatch.setattr("app.services.market.httpx.AsyncClient", _RateLimitClient)

    page = await get_ranked_markets(limit=1, page=1, sort="market_cap", order="desc")
    assert page.source == "cache"
    assert page.stale is True
    assert page.fallback_reason == "rate_limited"
    assert page.last_live_at == "2026-09-20T04:00:00Z"
    assert page.as_of == "2026-09-20T04:00:00Z"
    assert page.data[0].id == "bitcoin"

    movers = await get_movers(1)
    assert movers.stale is True
    assert movers.fallback_reason == "rate_limited"
    assert movers.last_live_at == "2026-09-20T04:00:00Z"


@pytest.mark.asyncio
async def test_unreachable_without_last_good_is_labeled_demo(monkeypatch):
    monkeypatch.setattr("app.services.market.httpx.AsyncClient", _FailingClient)
    page = await get_ranked_markets(limit=2, page=1, sort="market_cap", order="desc")
    assert page.source == "demo"
    assert page.stale is False
    assert page.fallback_reason == "unreachable"
    assert page.last_live_at is None
    assert page.as_of

    overview = await get_global_overview()
    assert overview.source == "demo"
    assert overview.fallback_reason == "unreachable"
    assert overview.stale is False


@pytest.mark.asyncio
async def test_hot_cache_envelope_keeps_last_live_at(monkeypatch):
    async def fake_get(_key):
        return {
            "items": [DEMO_MARKETS[0].model_dump()],
            "source": "coingecko",
            "last_live_at": "2026-09-20T03:00:00Z",
        }

    monkeypatch.setattr("app.services.market.cache_get", fake_get)
    page = await get_ranked_markets(limit=1, page=1, sort="market_cap", order="desc")
    assert page.source == "coingecko"
    assert page.stale is False
    assert page.last_live_at == "2026-09-20T03:00:00Z"
    assert page.fallback_reason is None


@pytest.mark.asyncio
async def test_global_rate_limit_uses_last_good(monkeypatch):
    monkeypatch.setattr("app.services.market.cache_get", _noop_cache_get)
    monkeypatch.setattr("app.services.market.cache_set", _noop_cache_set)
    await save_last_good("global", {
        "total_market_cap_usd": 9,
        "total_volume_24h_usd": 3,
        "btc_dominance": 51.0,
        "source": "coingecko",
        "coverage": "global",
        "note": "CoinGecko /global snapshot. Not CoinMarketCap.",
        "last_live_at": "2026-09-20T02:30:00Z",
        "as_of": "2026-09-20T02:30:00Z",
        "stale": False,
    })
    monkeypatch.setattr("app.services.market.httpx.AsyncClient", _RateLimitClient)
    overview = await get_global_overview()
    assert overview.source == "cache"
    assert overview.stale is True
    assert overview.fallback_reason == "rate_limited"
    assert overview.last_live_at == "2026-09-20T02:30:00Z"
    assert overview.total_market_cap_usd == 9
    assert overview.fear_greed_value is None
