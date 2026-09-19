import pytest

from app.models import MarketAsset
from app.services.market import (
    DEMO_MARKETS,
    snap_ohlc_days,
    get_asset,
    get_candles,
    get_markets_with_source,
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
async def test_markets_fall_back_to_demo(monkeypatch):
    monkeypatch.setattr("app.services.market.httpx.AsyncClient", _FailingClient)
    assets, source = await get_markets_with_source(2)
    assert source == "demo"
    assert [asset.id for asset in assets] == ["bitcoin", "ethereum"]


@pytest.mark.asyncio
async def test_asset_lookup_uses_demo_when_remote_fails(monkeypatch):
    monkeypatch.setattr("app.services.market.httpx.AsyncClient", _FailingClient)
    asset = await get_asset("sol")
    assert asset is not None
    assert asset.id == "solana"


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
    assert {asset.id for asset in DEMO_MARKETS} == {"bitcoin", "ethereum", "solana"}
    assert all(isinstance(asset, MarketAsset) for asset in DEMO_MARKETS)
