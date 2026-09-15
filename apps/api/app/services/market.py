import math
import time

import httpx

from app.config import get_settings
from app.models import Candle, MarketAsset


DEMO_MARKETS = [
    MarketAsset(id="bitcoin", symbol="btc", name="Bitcoin", current_price=63420, market_cap=1250000000000, market_cap_rank=1, total_volume=38000000000, high_24h=64600, low_24h=61200, price_change_percentage_24h=2.8),
    MarketAsset(id="ethereum", symbol="eth", name="Ethereum", current_price=3240, market_cap=389000000000, market_cap_rank=2, total_volume=17000000000, high_24h=3310, low_24h=3110, price_change_percentage_24h=1.7),
    MarketAsset(id="solana", symbol="sol", name="Solana", current_price=148, market_cap=69000000000, market_cap_rank=5, total_volume=4300000000, high_24h=154, low_24h=139, price_change_percentage_24h=5.9),
]


def _demo_candles(asset: MarketAsset, days: int) -> list[Candle]:
    count = max(24, min(days, 365))
    end_ms = int(time.time() * 1000)
    step_ms = 86_400_000
    anchor = max(float(asset.current_price or 1), 0.00000001)
    candles: list[Candle] = []
    previous = anchor * 0.88

    for index in range(count):
        trend = 1 + (index / max(count - 1, 1)) * 0.12
        wave = 1 + math.sin(index / 3.7) * 0.035 + math.sin(index / 9.3) * 0.02
        close = max(anchor * 0.88 * trend * wave, 0.00000001)
        open_price = previous
        spread = max(close * (0.009 + abs(math.sin(index)) * 0.012), close * 0.002)
        high = max(open_price, close) + spread
        low = max(min(open_price, close) - spread, close * 0.75)
        timestamp = end_ms - (count - index - 1) * step_ms
        candles.append(Candle(
            timestamp=timestamp,
            open=round(open_price, 10),
            high=round(high, 10),
            low=round(low, 10),
            close=round(close, 10),
            volume=float(asset.total_volume or 0) / max(count, 1),
        ))
        previous = close

    return candles


async def get_markets(limit: int = 20) -> list[MarketAsset]:
    settings = get_settings()
    params = {
        "vs_currency": "usd",
        "order": "market_cap_desc",
        "per_page": max(1, min(limit, 100)),
        "page": 1,
        "sparkline": "false",
        "price_change_percentage": "24h",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{settings.coingecko_base_url}/coins/markets", params=params)
            response.raise_for_status()
            payload = response.json()
            return [MarketAsset(**item) for item in payload]
    except Exception:
        return DEMO_MARKETS[:limit]


async def get_asset(coin_id: str) -> MarketAsset | None:
    markets = await get_markets(100)
    for asset in markets:
        if asset.id.lower() == coin_id.lower() or asset.symbol.lower() == coin_id.lower():
            return asset
    return None


async def get_candles(coin_id: str, days: int = 90) -> tuple[list[Candle], str]:
    settings = get_settings()
    normalized_days = max(1, min(days, 365))
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            response = await client.get(
                f"{settings.coingecko_base_url}/coins/{coin_id}/ohlc",
                params={"vs_currency": "usd", "days": normalized_days},
            )
            response.raise_for_status()
            payload = response.json()
            candles = [
                Candle(
                    timestamp=int(row[0]),
                    open=float(row[1]),
                    high=float(row[2]),
                    low=float(row[3]),
                    close=float(row[4]),
                )
                for row in payload
                if isinstance(row, list) and len(row) >= 5
            ]
            if candles:
                return candles, "coingecko"
    except Exception:
        pass

    asset = await get_asset(coin_id)
    if not asset:
        return [], "unavailable"
    return _demo_candles(asset, normalized_days), "demo"
