import logging
import math
import time

import httpx

from app.config import get_settings
from app.models import Candle, MarketAsset
from app.services.cache import cache_get, cache_set

logger = logging.getLogger(__name__)

# CoinGecko's public OHLC endpoint only accepts this closed set.
COINGECKO_OHLC_DAYS = (1, 7, 14, 30, 90, 180, 365)

DEMO_MARKETS = [
    MarketAsset(id="bitcoin", symbol="btc", name="Bitcoin", current_price=63420, market_cap=1250000000000, market_cap_rank=1, total_volume=38000000000, high_24h=64600, low_24h=61200, price_change_percentage_24h=2.8),
    MarketAsset(id="ethereum", symbol="eth", name="Ethereum", current_price=3240, market_cap=389000000000, market_cap_rank=2, total_volume=17000000000, high_24h=3310, low_24h=3110, price_change_percentage_24h=1.7),
    MarketAsset(id="solana", symbol="sol", name="Solana", current_price=148, market_cap=69000000000, market_cap_rank=5, total_volume=4300000000, high_24h=154, low_24h=139, price_change_percentage_24h=5.9),
]


def snap_ohlc_days(days: int) -> int:
    requested = max(1, min(int(days), 365))
    return min(COINGECKO_OHLC_DAYS, key=lambda allowed: (abs(allowed - requested), allowed))


def _headers() -> dict[str, str]:
    settings = get_settings()
    headers = {"User-Agent": "CoinVigilAI/0.3", "Accept": "application/json"}
    key = settings.coingecko_api_key.strip()
    if not key:
        return headers
    if "pro-api.coingecko.com" in settings.coingecko_base_url:
        headers["x-cg-pro-api-key"] = key
    else:
        headers["x-cg-demo-api-key"] = key
    return headers


def _match_asset(asset: MarketAsset, coin_id: str) -> bool:
    needle = coin_id.lower()
    return asset.id.lower() == needle or asset.symbol.lower() == needle


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


async def get_markets_with_source(limit: int = 20) -> tuple[list[MarketAsset], str]:
    settings = get_settings()
    bounded = max(1, min(limit, 100))
    cache_key = f"markets:{bounded}"
    cached = await cache_get(cache_key)
    if isinstance(cached, list) and cached:
        return [MarketAsset(**item) for item in cached], "cache"

    params = {
        "vs_currency": "usd",
        "order": "market_cap_desc",
        "per_page": bounded,
        "page": 1,
        "sparkline": "false",
        "price_change_percentage": "24h",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0, headers=_headers()) as client:
            response = await client.get(f"{settings.coingecko_base_url}/coins/markets", params=params)
            response.raise_for_status()
            payload = response.json()
            assets = [MarketAsset(**item) for item in payload]
            if assets:
                await cache_set(cache_key, [asset.model_dump() for asset in assets], settings.market_cache_ttl_seconds)
                return assets, "coingecko"
            logger.warning("CoinGecko markets returned an empty payload")
    except Exception as exc:
        logger.warning("CoinGecko markets unavailable (%s); using demo snapshot", type(exc).__name__)

    return DEMO_MARKETS[:bounded], "demo"


async def get_markets(limit: int = 20) -> list[MarketAsset]:
    assets, _source = await get_markets_with_source(limit)
    return assets


async def get_asset(coin_id: str) -> MarketAsset | None:
    settings = get_settings()
    needle = coin_id.strip().lower()
    if not needle:
        return None

    cache_key = f"asset:{needle}"
    cached = await cache_get(cache_key)
    if isinstance(cached, dict):
        return MarketAsset(**cached)

    try:
        async with httpx.AsyncClient(timeout=10.0, headers=_headers()) as client:
            response = await client.get(
                f"{settings.coingecko_base_url}/coins/markets",
                params={
                    "vs_currency": "usd",
                    "ids": needle,
                    "per_page": 1,
                    "page": 1,
                    "sparkline": "false",
                    "price_change_percentage": "24h",
                },
            )
            response.raise_for_status()
            payload = response.json()
            if payload:
                asset = MarketAsset(**payload[0])
                await cache_set(cache_key, asset.model_dump(), settings.market_cache_ttl_seconds)
                return asset
    except Exception as exc:
        logger.warning("CoinGecko asset lookup failed for %s (%s)", needle, type(exc).__name__)

    markets, _source = await get_markets_with_source(100)
    for asset in markets:
        if _match_asset(asset, needle):
            return asset

    for asset in DEMO_MARKETS:
        if _match_asset(asset, needle):
            return asset
    return None


async def get_candles(coin_id: str, days: int = 90) -> tuple[list[Candle], str]:
    settings = get_settings()
    normalized_days = snap_ohlc_days(days)
    cache_key = f"candles:{coin_id.lower()}:{normalized_days}"
    cached = await cache_get(cache_key)
    if isinstance(cached, list) and cached:
        return [Candle(**item) for item in cached], "cache"

    try:
        async with httpx.AsyncClient(timeout=12.0, headers=_headers()) as client:
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
                await cache_set(cache_key, [candle.model_dump() for candle in candles], settings.market_cache_ttl_seconds)
                return candles, "coingecko"
    except Exception as exc:
        logger.warning("CoinGecko candles unavailable for %s (%s); using demo series", coin_id, type(exc).__name__)

    asset = await get_asset(coin_id)
    if not asset:
        return [], "unavailable"
    return _demo_candles(asset, normalized_days), "demo"
