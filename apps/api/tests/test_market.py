import pytest

from app.models import MarketAsset
from app.services.market import (
    DEMO_MARKETS,
    get_asset,
    get_candles,
    get_global_overview,
    get_markets_with_source,
    get_movers,
    get_ranked_markets,
    market_asset_from_payload,
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
