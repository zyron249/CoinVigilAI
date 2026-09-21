import pytest

from app.services.convert import convert_quote
from app.services.market import DEMO_MARKETS


@pytest.mark.asyncio
async def test_convert_crypto_to_usd_from_tool_quote(monkeypatch):
    async def fake_asset(coin_id: str):
        for asset in DEMO_MARKETS:
            if asset.id == coin_id:
                return asset, "coingecko"
        return None, "unavailable"

    monkeypatch.setattr("app.services.convert.get_asset_with_source", fake_asset)
    quote = await convert_quote(2, "bitcoin", "usd")
    assert quote.missing == []
    assert quote.from_id == "bitcoin"
    assert quote.to_id == "usd"
    assert quote.to_price_usd == 1
    assert quote.value == pytest.approx(2 * (DEMO_MARKETS[0].current_price or 0))
    assert quote.source == "coingecko"
    assert "invent" in quote.note.lower()
    assert "not financial advice" in quote.disclaimer.lower()


@pytest.mark.asyncio
async def test_convert_crypto_to_crypto(monkeypatch):
    async def fake_asset(coin_id: str):
        for asset in DEMO_MARKETS:
            if asset.id == coin_id:
                return asset, "coingecko"
        return None, "unavailable"

    monkeypatch.setattr("app.services.convert.get_asset_with_source", fake_asset)
    btc = DEMO_MARKETS[0]
    eth = next(asset for asset in DEMO_MARKETS if asset.id == "ethereum")
    quote = await convert_quote(1, "bitcoin", "ethereum")
    assert quote.missing == []
    assert quote.value == pytest.approx((btc.current_price or 0) / (eth.current_price or 1))
    assert quote.source == "coingecko"


@pytest.mark.asyncio
async def test_convert_missing_stays_blank(monkeypatch):
    async def fake_asset(_coin_id: str):
        return None, "unavailable"

    monkeypatch.setattr("app.services.convert.get_asset_with_source", fake_asset)
    quote = await convert_quote(1, "not-a-real-coin", "usd")
    assert "not-a-real-coin" in quote.missing
    assert quote.value is None
    assert quote.source == "unavailable"
    assert "invent" in quote.note.lower()


@pytest.mark.asyncio
async def test_convert_demo_quote_is_labeled(monkeypatch):
    async def fake_asset(coin_id: str):
        for asset in DEMO_MARKETS:
            if asset.id == coin_id:
                return asset, "demo"
        return None, "unavailable"

    monkeypatch.setattr("app.services.convert.get_asset_with_source", fake_asset)
    quote = await convert_quote(1, "bitcoin", "usd")
    assert quote.source == "demo"
    assert quote.stale is True
    assert "demo" in quote.note.lower()
