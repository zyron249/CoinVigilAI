import logging
import math
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx

from app.config import get_settings
from app.models import Candle, GlobalOverview, MarketAsset, MarketMovers, RankedMarkets
from app.services.cache import cache_get, cache_set

logger = logging.getLogger(__name__)

# CoinGecko's public OHLC endpoint only accepts this closed set.
COINGECKO_OHLC_DAYS = (1, 7, 14, 30, 90, 180, 365)
MARKET_UNIVERSE_LIMIT = 100
VALID_SOURCES = {"coingecko", "cache", "demo"}
# Short process cache so one dashboard render does not stampede CoinGecko
# when Redis is down. Tests clear this via clear_market_memory_cache().
_MEMORY_TTL_SECONDS = 20.0
_LAST_GOOD_TTL_SECONDS = 6 * 60 * 60
_memory_cache: dict[str, tuple[float, Any]] = {}
_last_good: dict[str, dict[str, Any]] = {}
SORT_FIELDS = {
    "rank": "market_cap_rank",
    "market_cap": "market_cap",
    "volume": "total_volume",
    "price": "current_price",
    "name": "name",
    "change_1h": "price_change_percentage_1h",
    "change_24h": "price_change_percentage_24h",
    "change_7d": "price_change_percentage_7d",
}
NUMERIC_SORTS = {
    "rank",
    "market_cap",
    "volume",
    "price",
    "change_1h",
    "change_24h",
    "change_7d",
}


def clear_market_memory_cache() -> None:
    _memory_cache.clear()
    _last_good.clear()


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _fallback_reason(exc: Exception) -> str:
    if isinstance(exc, httpx.HTTPStatusError) and exc.response is not None and exc.response.status_code == 429:
        return "rate_limited"
    return "unreachable"


@dataclass(frozen=True)
class UniverseSnapshot:
    assets: list[MarketAsset]
    source: str
    last_live_at: str | None = None
    stale: bool = False
    fallback_reason: str | None = None

    def as_tuple(self) -> tuple[list[MarketAsset], str]:
        return list(self.assets), self.source


def _memory_get(key: str) -> Any | None:
    row = _memory_cache.get(key)
    if not row:
        return None
    stamped, value = row
    if time.time() - stamped > _MEMORY_TTL_SECONDS:
        _memory_cache.pop(key, None)
        return None
    return value


def _memory_set(key: str, value: Any) -> None:
    _memory_cache[key] = (time.time(), value)


def _remember_last_good(kind: str, payload: dict[str, Any]) -> None:
    _last_good[kind] = payload


def _read_last_good(kind: str) -> dict[str, Any] | None:
    return _last_good.get(kind)


async def save_last_good(kind: str, payload: dict[str, Any]) -> None:
    _remember_last_good(kind, payload)
    await cache_set(f"markets:last_good:{kind}", payload, _LAST_GOOD_TTL_SECONDS)


async def load_last_good(kind: str) -> dict[str, Any] | None:
    local = _read_last_good(kind)
    if local:
        return local
    cached = await cache_get(f"markets:last_good:{kind}")
    if isinstance(cached, dict) and cached.get("source") in VALID_SOURCES and cached.get("source") != "demo":
        _remember_last_good(kind, cached)
        return cached
    return None


def _demo_sparkline(anchor: float, change_7d: float) -> list[float]:
    start = max(float(anchor) / (1 + change_7d / 100.0), 1e-12)
    points: list[float] = []
    for index in range(48):
        progress = index / 47
        wave = 1 + math.sin(index / 5.2) * 0.018
        value = start * (1 + progress * (change_7d / 100.0)) * wave
        points.append(round(value, 8))
    return points


def _demo_asset(**kwargs: Any) -> MarketAsset:
    price = float(kwargs.get("current_price") or 1)
    change_7d = float(kwargs.get("price_change_percentage_7d") or 0)
    kwargs.setdefault("sparkline_7d", _demo_sparkline(price, change_7d))
    return MarketAsset(**kwargs)


# Labeled synthetic stand-in used only when CoinGecko is unreachable.
DEMO_MARKETS = [
    _demo_asset(
        id="bitcoin", symbol="btc", name="Bitcoin", current_price=63420, market_cap=1_250_000_000_000,
        market_cap_rank=1, total_volume=38_000_000_000, high_24h=64600, low_24h=61200,
        price_change_percentage_24h=2.8, price_change_percentage_1h=0.4, price_change_percentage_7d=4.1,
        circulating_supply=19_700_000, total_supply=19_700_000, max_supply=21_000_000,
        fully_diluted_valuation=1_332_000_000_000,
    ),
    _demo_asset(
        id="ethereum", symbol="eth", name="Ethereum", current_price=3240, market_cap=389_000_000_000,
        market_cap_rank=2, total_volume=17_000_000_000, high_24h=3310, low_24h=3110,
        price_change_percentage_24h=1.7, price_change_percentage_1h=-0.2, price_change_percentage_7d=2.4,
        circulating_supply=120_400_000, total_supply=120_400_000,
        fully_diluted_valuation=389_000_000_000,
    ),
    _demo_asset(
        id="solana", symbol="sol", name="Solana", current_price=148, market_cap=69_000_000_000,
        market_cap_rank=5, total_volume=4_300_000_000, high_24h=154, low_24h=139,
        price_change_percentage_24h=5.9, price_change_percentage_1h=1.1, price_change_percentage_7d=8.2,
        circulating_supply=466_000_000, total_supply=580_000_000,
        fully_diluted_valuation=85_800_000_000,
    ),
    _demo_asset(
        id="binancecoin", symbol="bnb", name="BNB", current_price=580, market_cap=84_000_000_000,
        market_cap_rank=4, total_volume=1_800_000_000, high_24h=588, low_24h=571,
        price_change_percentage_24h=0.4, price_change_percentage_1h=0.1, price_change_percentage_7d=-1.3,
        circulating_supply=145_000_000, total_supply=145_000_000, max_supply=200_000_000,
        fully_diluted_valuation=116_000_000_000,
    ),
    _demo_asset(
        id="ripple", symbol="xrp", name="XRP", current_price=0.52, market_cap=29_000_000_000,
        market_cap_rank=6, total_volume=1_200_000_000, high_24h=0.54, low_24h=0.50,
        price_change_percentage_24h=-1.2, price_change_percentage_1h=-0.6, price_change_percentage_7d=-3.8,
        circulating_supply=56_000_000_000, total_supply=99_900_000_000, max_supply=100_000_000_000,
        fully_diluted_valuation=52_000_000_000,
    ),
    _demo_asset(
        id="cardano", symbol="ada", name="Cardano", current_price=0.38, market_cap=13_400_000_000,
        market_cap_rank=9, total_volume=420_000_000, high_24h=0.40, low_24h=0.36,
        price_change_percentage_24h=3.1, price_change_percentage_1h=0.8, price_change_percentage_7d=5.0,
        circulating_supply=35_200_000_000, total_supply=45_000_000_000, max_supply=45_000_000_000,
        fully_diluted_valuation=17_100_000_000,
    ),
    _demo_asset(
        id="dogecoin", symbol="doge", name="Dogecoin", current_price=0.12, market_cap=17_600_000_000,
        market_cap_rank=8, total_volume=980_000_000, high_24h=0.13, low_24h=0.11,
        price_change_percentage_24h=-4.5, price_change_percentage_1h=-1.4, price_change_percentage_7d=-6.2,
        circulating_supply=146_000_000_000, total_supply=146_000_000_000,
        fully_diluted_valuation=17_600_000_000,
    ),
    _demo_asset(
        id="avalanche-2", symbol="avax", name="Avalanche", current_price=28, market_cap=11_400_000_000,
        market_cap_rank=11, total_volume=610_000_000, high_24h=30, low_24h=26,
        price_change_percentage_24h=6.8, price_change_percentage_1h=1.8, price_change_percentage_7d=11.4,
        circulating_supply=407_000_000, total_supply=449_000_000, max_supply=720_000_000,
        fully_diluted_valuation=20_200_000_000,
    ),
]


def snap_ohlc_days(days: int) -> int:
    requested = max(1, min(int(days), 365))
    return min(COINGECKO_OHLC_DAYS, key=lambda allowed: (abs(allowed - requested), allowed))


def normalize_sort(sort: str | None) -> str:
    key = (sort or "market_cap").strip().lower()
    return key if key in SORT_FIELDS else "market_cap"


def normalize_order(order: str | None) -> str:
    value = (order or "desc").strip().lower()
    return value if value in {"asc", "desc"} else "desc"


def _headers() -> dict[str, str]:
    settings = get_settings()
    headers = {"User-Agent": "CoinVigilAI/0.4", "Accept": "application/json"}
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


def _as_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _as_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _sparkline_points(raw: Any) -> list[float]:
    if isinstance(raw, dict):
        raw = raw.get("price")
    if not isinstance(raw, list):
        return []
    points: list[float] = []
    for item in raw:
        number = _as_float(item)
        if number is not None:
            points.append(number)
    return points


def market_asset_from_payload(item: dict[str, Any]) -> MarketAsset:
    """Map a CoinGecko markets row (or a cached dump) onto MarketAsset."""
    return MarketAsset(
        id=str(item.get("id") or ""),
        symbol=str(item.get("symbol") or ""),
        name=str(item.get("name") or item.get("id") or "unknown"),
        image=item.get("image"),
        current_price=_as_float(item.get("current_price")),
        market_cap=_as_float(item.get("market_cap")),
        market_cap_rank=_as_int(item.get("market_cap_rank")),
        total_volume=_as_float(item.get("total_volume")),
        high_24h=_as_float(item.get("high_24h")),
        low_24h=_as_float(item.get("low_24h")),
        price_change_percentage_24h=_as_float(
            item.get("price_change_percentage_24h_in_currency")
            if item.get("price_change_percentage_24h_in_currency") is not None
            else item.get("price_change_percentage_24h")
        ),
        price_change_percentage_1h=_as_float(
            item.get("price_change_percentage_1h")
            if item.get("price_change_percentage_1h") is not None
            else item.get("price_change_percentage_1h_in_currency")
        ),
        price_change_percentage_7d=_as_float(
            item.get("price_change_percentage_7d")
            if item.get("price_change_percentage_7d") is not None
            else item.get("price_change_percentage_7d_in_currency")
        ),
        circulating_supply=_as_float(item.get("circulating_supply")),
        total_supply=_as_float(item.get("total_supply")),
        max_supply=_as_float(item.get("max_supply")),
        fully_diluted_valuation=_as_float(item.get("fully_diluted_valuation")),
        sparkline_7d=_sparkline_points(item.get("sparkline_7d") or item.get("sparkline_in_7d")),
        last_updated=str(item["last_updated"]) if item.get("last_updated") else None,
    )


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


def _sort_assets(assets: list[MarketAsset], sort: str, order: str) -> list[MarketAsset]:
    field = SORT_FIELDS[normalize_sort(sort)]
    descending = normalize_order(order) == "desc"

    def key(asset: MarketAsset) -> tuple[int, Any]:
        value = getattr(asset, field, None)
        if value is None:
            return (1, 0)
        if field == "name":
            return (0, str(value).lower())
        return (0, value)

    return sorted(assets, key=key, reverse=descending)


def _slice_page(assets: list[MarketAsset], page: int, limit: int) -> list[MarketAsset]:
    start = max(0, (page - 1) * limit)
    return assets[start:start + limit]


def _snapshot_from_payload(payload: dict[str, Any], *, stale: bool, fallback_reason: str | None = None) -> UniverseSnapshot | None:
    raw = payload.get("items") or payload.get("data")
    if not isinstance(raw, list) or not raw:
        return None
    assets = [market_asset_from_payload(item) if isinstance(item, dict) else item for item in raw]
    assets = [asset for asset in assets if getattr(asset, "id", None)]
    if not assets:
        return None
    source = str(payload.get("source") or "cache")
    if source not in VALID_SOURCES:
        source = "cache"
    return UniverseSnapshot(
        assets=assets,
        source="cache" if stale and source == "coingecko" else source,
        last_live_at=payload.get("last_live_at"),
        stale=stale,
        fallback_reason=fallback_reason,
    )


async def get_universe_snapshot() -> UniverseSnapshot:
    mem = _memory_get("universe")
    if isinstance(mem, UniverseSnapshot) and mem.assets:
        return UniverseSnapshot(list(mem.assets), mem.source, mem.last_live_at, mem.stale, mem.fallback_reason)
    if isinstance(mem, tuple) and len(mem) == 2 and mem[0]:
        return UniverseSnapshot(list(mem[0]), mem[1])

    settings = get_settings()
    cache_key = f"markets:v3:universe:{MARKET_UNIVERSE_LIMIT}"
    cached = await cache_get(cache_key)
    if isinstance(cached, dict):
        snapshot = _snapshot_from_payload(cached, stale=False)
        if snapshot:
            _memory_set("universe", snapshot)
            return snapshot
    if isinstance(cached, list) and cached:
        assets = [market_asset_from_payload(item) for item in cached if item.get("id")]
        snapshot = UniverseSnapshot(assets, "cache")
        _memory_set("universe", snapshot)
        return snapshot

    params = {
        "vs_currency": "usd",
        "order": "market_cap_desc",
        "per_page": MARKET_UNIVERSE_LIMIT,
        "page": 1,
        "sparkline": "true",
        "price_change_percentage": "1h,24h,7d",
    }
    try:
        async with httpx.AsyncClient(timeout=12.0, headers=_headers()) as client:
            response = await client.get(f"{settings.coingecko_base_url}/coins/markets", params=params)
            response.raise_for_status()
            payload = response.json()
            assets = [market_asset_from_payload(item) for item in payload if isinstance(item, dict) and item.get("id")]
            if assets:
                fetched_at = _now_iso()
                snapshot = UniverseSnapshot(assets, "coingecko", last_live_at=fetched_at, stale=False)
                envelope = {
                    "items": [asset.model_dump() for asset in assets],
                    "source": "coingecko",
                    "last_live_at": fetched_at,
                }
                await cache_set(cache_key, envelope, settings.market_cache_ttl_seconds)
                await save_last_good("universe", envelope)
                _memory_set("universe", snapshot)
                return snapshot
            logger.warning("CoinGecko markets returned an empty payload")
            reason = "unreachable"
    except Exception as exc:
        reason = _fallback_reason(exc)
        logger.warning("CoinGecko markets unavailable (%s); trying last live snapshot", type(exc).__name__)

    last_good = await load_last_good("universe")
    if last_good:
        snapshot = _snapshot_from_payload(last_good, stale=True, fallback_reason=reason)
        if snapshot:
            _memory_set("universe", snapshot)
            return snapshot

    demo = list(DEMO_MARKETS)
    snapshot = UniverseSnapshot(demo, "demo", stale=False, fallback_reason=reason)
    _memory_set("universe", snapshot)
    return snapshot


async def get_market_universe() -> tuple[list[MarketAsset], str]:
    return (await get_universe_snapshot()).as_tuple()


async def get_markets_with_source(limit: int = 20) -> tuple[list[MarketAsset], str]:
    ranked = await get_ranked_markets(limit=limit, page=1, sort="market_cap", order="desc")
    return ranked.data, ranked.source


async def get_markets(limit: int = 20) -> list[MarketAsset]:
    assets, _source = await get_markets_with_source(limit)
    return assets


def _freshness_fields(snapshot: UniverseSnapshot) -> dict[str, Any]:
    return {
        "last_live_at": snapshot.last_live_at,
        "as_of": snapshot.last_live_at if snapshot.stale else _now_iso(),
        "stale": snapshot.stale,
        "fallback_reason": snapshot.fallback_reason,
    }


async def get_ranked_markets(
    limit: int = 50,
    page: int = 1,
    sort: str = "market_cap",
    order: str = "desc",
) -> RankedMarkets:
    bounded_limit = max(1, min(int(limit), 100))
    bounded_page = max(1, min(int(page), 50))
    sort_key = normalize_sort(sort)
    order_key = normalize_order(order)
    snapshot = await get_universe_snapshot()
    ranked = _sort_assets(snapshot.assets, sort_key, order_key)
    page_rows = _slice_page(ranked, bounded_page, bounded_limit)
    return RankedMarkets(
        data=page_rows,
        count=len(page_rows),
        page=bounded_page,
        limit=bounded_limit,
        total=len(ranked),
        sort=sort_key,
        order=order_key,
        source=snapshot.source,
        universe_size=len(ranked),
        coverage="universe",
        **_freshness_fields(snapshot),
    )


def _overview_from_assets(
    assets: list[MarketAsset],
    source: str,
    *,
    last_live_at: str | None = None,
    stale: bool = False,
    fallback_reason: str | None = None,
) -> GlobalOverview:
    total_cap = sum(asset.market_cap or 0 for asset in assets)
    total_volume = sum(asset.total_volume or 0 for asset in assets)
    btc = next((asset for asset in assets if asset.id == "bitcoin"), None)
    eth = next((asset for asset in assets if asset.id == "ethereum"), None)
    btc_dom = ((btc.market_cap or 0) / total_cap * 100) if btc and total_cap else None
    eth_dom = ((eth.market_cap or 0) / total_cap * 100) if eth and total_cap else None
    note = (
        "Demo snapshot totals across the labeled fallback universe, not live global market cap."
        if source == "demo"
        else f"Derived from the ranked CoinVigil universe ({len(assets)} assets), not CoinGecko /global."
    )
    return GlobalOverview(
        total_market_cap_usd=total_cap or None,
        total_volume_24h_usd=total_volume or None,
        market_cap_change_percentage_24h_usd=None,
        btc_dominance=round(btc_dom, 2) if btc_dom is not None else None,
        eth_dominance=round(eth_dom, 2) if eth_dom is not None else None,
        active_cryptocurrencies=len(assets),
        source=source,
        coverage="universe",
        note=note,
        last_live_at=last_live_at,
        as_of=last_live_at if stale else _now_iso(),
        stale=stale,
        fallback_reason=fallback_reason,
    )


async def _fear_greed() -> tuple[int, str, str] | None:
    settings = get_settings()
    url = settings.fear_greed_url.strip()
    if not url:
        return None
    try:
        async with httpx.AsyncClient(timeout=6.0, headers={"User-Agent": "CoinVigilAI/0.4", "Accept": "application/json"}) as client:
            response = await client.get(url)
            response.raise_for_status()
            payload = response.json()
        rows = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(rows, list) or not rows:
            return None
        row = rows[0]
        value = _as_int(row.get("value"))
        classification = str(row.get("value_classification") or "").strip()
        if value is None or not classification:
            return None
        return value, classification, "alternative.me"
    except Exception as exc:
        logger.info("Fear & Greed unavailable (%s); omitting index", type(exc).__name__)
        return None


def _overview_from_last_good(payload: dict[str, Any], reason: str) -> GlobalOverview:
    fields = {key: payload.get(key) for key in GlobalOverview.model_fields}
    overview = GlobalOverview(**fields)
    overview.source = "cache"
    overview.stale = True
    overview.fallback_reason = reason
    overview.as_of = overview.last_live_at or _now_iso()
    return overview


async def get_global_overview() -> GlobalOverview:
    settings = get_settings()
    mem = _memory_get("global")
    if isinstance(mem, dict) and mem.get("source") in VALID_SOURCES:
        return GlobalOverview(**mem)
    cache_key = "markets:v3:global"
    cached = await cache_get(cache_key)
    if isinstance(cached, dict) and cached.get("source") in VALID_SOURCES:
        _memory_set("global", cached)
        return GlobalOverview(**cached)

    fear = await _fear_greed()
    reason: str | None = None
    try:
        async with httpx.AsyncClient(timeout=10.0, headers=_headers()) as client:
            response = await client.get(f"{settings.coingecko_base_url}/global")
            response.raise_for_status()
            payload = response.json()
        blob = payload.get("data") if isinstance(payload, dict) else None
        if isinstance(blob, dict):
            caps = blob.get("total_market_cap") or {}
            volumes = blob.get("total_volume") or {}
            dominance = blob.get("market_cap_percentage") or {}
            fetched_at = _now_iso()
            overview = GlobalOverview(
                total_market_cap_usd=_as_float(caps.get("usd") if isinstance(caps, dict) else None),
                total_volume_24h_usd=_as_float(volumes.get("usd") if isinstance(volumes, dict) else None),
                market_cap_change_percentage_24h_usd=_as_float(blob.get("market_cap_change_percentage_24h_usd")),
                btc_dominance=_as_float(dominance.get("btc") if isinstance(dominance, dict) else None),
                eth_dominance=_as_float(dominance.get("eth") if isinstance(dominance, dict) else None),
                active_cryptocurrencies=_as_int(blob.get("active_cryptocurrencies")),
                source="coingecko",
                coverage="global",
                note="CoinGecko /global snapshot. Not CoinMarketCap.",
                updated_at=_as_int(blob.get("updated_at")),
                last_live_at=fetched_at,
                as_of=fetched_at,
                stale=False,
            )
            if fear:
                overview.fear_greed_value, overview.fear_greed_classification, overview.fear_greed_source = fear
            dumped = overview.model_dump()
            await cache_set(cache_key, dumped, settings.market_cache_ttl_seconds)
            await save_last_good("global", dumped)
            _memory_set("global", dumped)
            return overview
        reason = "unreachable"
    except Exception as exc:
        reason = _fallback_reason(exc)
        logger.warning("CoinGecko global unavailable (%s); trying last live snapshot", type(exc).__name__)
        last_good = await load_last_good("global")
        if last_good:
            overview = _overview_from_last_good(last_good, reason)
            if fear and overview.fear_greed_value is None:
                overview.fear_greed_value, overview.fear_greed_classification, overview.fear_greed_source = fear
            _memory_set("global", overview.model_dump())
            return overview

    snapshot = await get_universe_snapshot()
    overview = _overview_from_assets(
        snapshot.assets,
        snapshot.source,
        last_live_at=snapshot.last_live_at,
        stale=snapshot.stale,
        fallback_reason=snapshot.fallback_reason or reason,
    )
    if fear:
        overview.fear_greed_value, overview.fear_greed_classification, overview.fear_greed_source = fear
    _memory_set("global", overview.model_dump())
    return overview


async def get_movers(limit: int = 5) -> MarketMovers:
    bounded = max(1, min(int(limit), 15))
    snapshot = await get_universe_snapshot()
    scored = [asset for asset in snapshot.assets if asset.price_change_percentage_24h is not None]
    gainers = sorted(
        [asset for asset in scored if (asset.price_change_percentage_24h or 0) > 0],
        key=lambda asset: asset.price_change_percentage_24h or 0,
        reverse=True,
    )[:bounded]
    losers = sorted(
        [asset for asset in scored if (asset.price_change_percentage_24h or 0) < 0],
        key=lambda asset: asset.price_change_percentage_24h or 0,
    )[:bounded]
    return MarketMovers(
        gainers=gainers,
        losers=losers,
        count=bounded,
        source=snapshot.source,
        **_freshness_fields(snapshot),
    )


async def get_asset_with_source(coin_id: str) -> tuple[MarketAsset | None, str]:
    settings = get_settings()
    needle = coin_id.strip().lower()
    if not needle:
        return None, "unavailable"

    cache_key = f"asset:v2:{needle}"
    cached = await cache_get(cache_key)
    if isinstance(cached, dict) and cached.get("id"):
        return market_asset_from_payload(cached), "cache"

    try:
        async with httpx.AsyncClient(timeout=10.0, headers=_headers()) as client:
            response = await client.get(
                f"{settings.coingecko_base_url}/coins/markets",
                params={
                    "vs_currency": "usd",
                    "ids": needle,
                    "per_page": 1,
                    "page": 1,
                    "sparkline": "true",
                    "price_change_percentage": "1h,24h,7d",
                },
            )
            response.raise_for_status()
            payload = response.json()
            if payload:
                asset = market_asset_from_payload(payload[0])
                await cache_set(cache_key, asset.model_dump(), settings.market_cache_ttl_seconds)
                return asset, "coingecko"
    except Exception as exc:
        logger.warning("CoinGecko asset lookup failed for %s (%s)", needle, type(exc).__name__)

    markets, source = await get_market_universe()
    for asset in markets:
        if _match_asset(asset, needle):
            return asset, source

    for asset in DEMO_MARKETS:
        if _match_asset(asset, needle):
            return asset, "demo"
    return None, "unavailable"


async def get_asset(coin_id: str) -> MarketAsset | None:
    asset, _source = await get_asset_with_source(coin_id)
    return asset


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
