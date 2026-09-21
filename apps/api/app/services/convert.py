from app.models import ConvertQuote, MarketAsset
from app.services.market import get_asset_with_source

FIAT = {
    "usd": {"id": "usd", "symbol": "USD", "name": "US Dollar"},
}


def _row(asset: MarketAsset, source: str) -> dict:
    return {
        "id": asset.id,
        "symbol": asset.symbol.upper(),
        "name": asset.name,
        "price_usd": asset.current_price,
        "source": source,
        "last_updated": asset.last_updated,
        "stale": source in {"cache", "demo"},
    }


async def _unit(coin_id: str) -> dict | None:
    needle = (coin_id or "").strip().lower()
    if not needle:
        return None
    if needle in FIAT:
        meta = FIAT[needle]
        return {
            "id": meta["id"],
            "symbol": meta["symbol"],
            "name": meta["name"],
            "price_usd": 1.0,
            "source": "fiat",
            "last_updated": None,
            "stale": False,
        }
    asset, source = await get_asset_with_source(needle)
    if not asset:
        return None
    return _row(asset, source)


async def convert_quote(amount: float, from_id: str, to_id: str) -> ConvertQuote:
    missing: list[str] = []
    left = await _unit(from_id)
    right = await _unit(to_id)
    if not left:
        missing.append((from_id or "").strip().lower() or "from")
    if not right:
        missing.append((to_id or "").strip().lower() or "to")

    sources = {row["source"] for row in (left, right) if row}
    source = "demo" if "demo" in sources else "cache" if "cache" in sources else "coingecko" if "coingecko" in sources else "fiat" if sources == {"fiat"} else "unavailable"
    stale = any(bool(row.get("stale")) for row in (left, right) if row)
    from_price = left.get("price_usd") if left else None
    to_price = right.get("price_usd") if right else None
    value = None
    rate = None
    if left and right and from_price not in (None, 0) and to_price not in (None, 0) and not missing:
        rate = from_price / to_price
        value = amount * rate

    note = (
        "Converted from live CoinGecko USD quotes in this snapshot. CoinVigil does not invent FX rates."
        if source == "coingecko" and not stale
        else "One or both legs used a cached or demo quote — labeled, not dressed up as live."
        if source in {"cache", "demo"} or stale
        else "USD is treated as $1. Crypto legs still come from CoinGecko tools."
        if source == "fiat" or "fiat" in sources
        else "Missing ids stay blank. CoinVigil does not invent a conversion."
    )
    if missing:
        note = "Missing ids stay blank. CoinVigil does not invent a conversion."

    return ConvertQuote(
        amount=amount,
        from_id=(left or {}).get("id") or (from_id or "").strip().lower(),
        from_symbol=(left or {}).get("symbol") or (from_id or "").upper(),
        from_name=(left or {}).get("name") or (from_id or "unknown"),
        from_price_usd=from_price,
        to_id=(right or {}).get("id") or (to_id or "").strip().lower(),
        to_symbol=(right or {}).get("symbol") or (to_id or "").upper(),
        to_name=(right or {}).get("name") or (to_id or "unknown"),
        to_price_usd=to_price,
        value=value,
        rate=rate,
        source=source if not missing else "unavailable",
        missing=missing,
        stale=stale,
        last_live_at=(left or {}).get("last_updated") if left and left.get("source") == "coingecko" else None,
        note=note,
    )
