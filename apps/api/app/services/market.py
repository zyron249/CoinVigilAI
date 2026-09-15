import httpx
from app.config import get_settings
from app.models import MarketAsset


DEMO_MARKETS = [
    MarketAsset(id="bitcoin", symbol="btc", name="Bitcoin", current_price=63420, market_cap=1250000000000, market_cap_rank=1, total_volume=38000000000, high_24h=64600, low_24h=61200, price_change_percentage_24h=2.8),
    MarketAsset(id="ethereum", symbol="eth", name="Ethereum", current_price=3240, market_cap=389000000000, market_cap_rank=2, total_volume=17000000000, high_24h=3310, low_24h=3110, price_change_percentage_24h=1.7),
    MarketAsset(id="solana", symbol="sol", name="Solana", current_price=148, market_cap=69000000000, market_cap_rank=5, total_volume=4300000000, high_24h=154, low_24h=139, price_change_percentage_24h=5.9),
]


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
