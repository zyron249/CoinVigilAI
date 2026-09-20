import logging
import math
import time
import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx

from app.config import get_settings
from app.models import AssetCompare, AssetTickers, Candle, ExchangeTicker, GlobalOverview, MarketAsset, MarketMovers, RankedMarkets
from app.services.cache import cache_get, cache_set

logger = logging.getLogger(__name__)

# CoinGecko's public OHLC endpoint only accepts this closed set.
COINGECKO_OHLC_DAYS = (1, 7, 14, 30, 90, 180, 365)
# CoinGecko public/demo `/coins/markets` allows per_page up to 250. We paginate
# that endpoint into one ranked snapshot — CoinGecko-tracked assets, not every
# coin on every exchange.
MARKET_UNIVERSE_LIMIT = 250
MARKET_UNIVERSE_PAGES = 4
TICKER_SOURCE_PAGES = 3
TICKER_PAGE_SIZE = 100
VALID_SOURCES = {"coingecko", "cache", "demo"}
UNIVERSE_CACHE_KEY = f"markets:v6:universe:{MARKET_UNIVERSE_LIMIT}x{MARKET_UNIVERSE_PAGES}"
COVERAGE_CAP = MARKET_UNIVERSE_LIMIT * MARKET_UNIVERSE_PAGES
RETRY_ATTEMPTS = 3
RETRY_BASE_DELAY_SECONDS = 0.35
MAX_RETRY_SLEEP_SECONDS = 1.2
PAGE_GAP_SECONDS = 0.2
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
TICKER_SORT_FIELDS = ("volume", "price", "spread", "exchange", "pair", "trust")
TRUST_RANK = {"green": 3, "yellow": 2, "red": 1}
COMPARE_LIMIT = 3
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


async def _sleep(seconds: float) -> None:
    await asyncio.sleep(seconds)


async def _coingecko_get(client: httpx.AsyncClient, url: str, params: dict[str, Any] | None = None) -> httpx.Response:
    """GET with backoff on 429/5xx. Never invents a payload."""
    delay = RETRY_BASE_DELAY_SECONDS
    last_error: Exception | None = None
    for attempt in range(1, RETRY_ATTEMPTS + 1):
        try:
            response = await client.get(url, params=params)
            if response.status_code == 429 or response.status_code >= 500:
                retry_after = response.headers.get("Retry-After")
                wait_for = delay
                if retry_after:
                    try:
                        wait_for = max(delay, float(retry_after))
                    except ValueError:
                        wait_for = delay
                if attempt < RETRY_ATTEMPTS:
                    logger.warning("CoinGecko %s on %s (attempt %s); retry in %.2fs", response.status_code, url, attempt, min(wait_for, MAX_RETRY_SLEEP_SECONDS))
                    await _sleep(min(wait_for, MAX_RETRY_SLEEP_SECONDS))
                    delay *= 2
                    continue
            response.raise_for_status()
            return response
        except Exception as exc:
            last_error = exc
            if attempt < RETRY_ATTEMPTS and _fallback_reason(exc) in {"rate_limited", "unreachable"}:
                logger.warning("CoinGecko error on %s (%s attempt %s); retry in %.2fs", url, type(exc).__name__, attempt, min(delay, MAX_RETRY_SLEEP_SECONDS))
                await _sleep(min(delay, MAX_RETRY_SLEEP_SECONDS))
                delay *= 2
                continue
            raise
    if last_error:
        raise last_error
    raise RuntimeError("CoinGecko request failed")


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
    partial: bool = False

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


def normalize_ticker_sort(sort: str | None) -> str:
    key = (sort or "volume").strip().lower()
    return key if key in TICKER_SORT_FIELDS else "volume"


def parse_compare_ids(raw: str | None) -> list[str]:
    seen: set[str] = set()
    ids: list[str] = []
    blob = (raw or "").replace(";", ",")
    for token in blob.split(","):
        needle = token.strip().lower()
        if not needle or needle in seen:
            continue
        seen.add(needle)
        ids.append(needle)
        if len(ids) >= COMPARE_LIMIT:
            break
    return ids


def sort_tickers(rows: list[ExchangeTicker], sort: str | None, order: str | None) -> list[ExchangeTicker]:
    """Stable local sort. Unscored/missing numeric fields always sort last."""
    sort_key = normalize_ticker_sort(sort)
    descending = normalize_order(order) == "desc"

    if sort_key in {"exchange", "pair"}:
        def label_key(ticker: ExchangeTicker) -> tuple[str, str]:
            if sort_key == "exchange":
                return (ticker.exchange.lower(), ticker.pair.lower())
            return (ticker.pair.lower(), ticker.exchange.lower())
        return sorted(rows, key=label_key, reverse=descending)

    def decorated(ticker: ExchangeTicker) -> tuple:
        if sort_key == "trust":
            score = (ticker.trust_score or "").lower()
            missing = score not in TRUST_RANK
            rank = TRUST_RANK.get(score, 0)
            return (missing, -rank if descending else rank, ticker.exchange.lower())
        if sort_key == "price":
            value = ticker.price_usd if ticker.price_usd is not None else ticker.last_price
        elif sort_key == "spread":
            value = ticker.bid_ask_spread_percentage
        else:
            value = ticker.volume_usd
        missing = value is None
        numeric = 0.0 if missing else float(value)
        return (missing, -numeric if descending else numeric, ticker.exchange.lower())

    return sorted(rows, key=decorated)


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
        ath=_as_float(item.get("ath")),
        ath_change_percentage=_as_float(item.get("ath_change_percentage")),
        ath_date=str(item["ath_date"]) if item.get("ath_date") else None,
        atl=_as_float(item.get("atl")),
        atl_change_percentage=_as_float(item.get("atl_change_percentage")),
        atl_date=str(item["atl_date"]) if item.get("atl_date") else None,
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
        partial=bool(payload.get("partial")),
    )


async def peek_universe_status() -> dict[str, Any]:
    """Last observed Live/cache/demo path. Never calls CoinGecko."""
    empty = {
        "source": None,
        "stale": False,
        "last_live_at": None,
        "fallback_reason": None,
        "observed": False,
    }

    def from_snapshot(snapshot: UniverseSnapshot) -> dict[str, Any]:
        return {
            "source": snapshot.source,
            "stale": snapshot.stale,
            "last_live_at": snapshot.last_live_at,
            "fallback_reason": snapshot.fallback_reason,
            "observed": True,
        }

    mem_row = _memory_cache.get("universe")
    if mem_row:
        _stamped, mem = mem_row
        if isinstance(mem, UniverseSnapshot) and mem.assets:
            return from_snapshot(mem)
        if isinstance(mem, tuple) and len(mem) == 2 and mem[0]:
            return from_snapshot(UniverseSnapshot(list(mem[0]), mem[1]))

    cache_key = UNIVERSE_CACHE_KEY
    cached = await cache_get(cache_key)
    if isinstance(cached, dict):
        snapshot = _snapshot_from_payload(cached, stale=False)
        if snapshot:
            return from_snapshot(snapshot)
    if isinstance(cached, list) and cached:
        return {
            "source": "cache",
            "stale": False,
            "last_live_at": None,
            "fallback_reason": None,
            "observed": True,
        }

    last_good = await load_last_good("universe")
    if last_good:
        snapshot = _snapshot_from_payload(last_good, stale=True)
        if snapshot:
            return from_snapshot(snapshot)
    return empty


async def get_universe_snapshot() -> UniverseSnapshot:
    mem = _memory_get("universe")
    if isinstance(mem, UniverseSnapshot) and mem.assets:
        return UniverseSnapshot(list(mem.assets), mem.source, mem.last_live_at, mem.stale, mem.fallback_reason, mem.partial)
    if isinstance(mem, tuple) and len(mem) == 2 and mem[0]:
        return UniverseSnapshot(list(mem[0]), mem[1])

    settings = get_settings()
    cache_key = UNIVERSE_CACHE_KEY
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

    try:
        snapshot = await _fetch_coingecko_market_universe()
        if snapshot and snapshot.assets:
            envelope = {
                "items": [asset.model_dump() for asset in snapshot.assets],
                "source": "coingecko",
                "last_live_at": snapshot.last_live_at,
                "partial": snapshot.partial,
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
    snapshot = UniverseSnapshot(demo, "demo", stale=False, fallback_reason=reason, partial=False)
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


def _filter_assets(assets: list[MarketAsset], query: str | None) -> list[MarketAsset]:
    needle = (query or "").strip().lower()
    if not needle:
        return assets
    return [
        asset
        for asset in assets
        if needle in asset.id.lower()
        or needle in asset.symbol.lower()
        or needle in asset.name.lower()
    ]


def _coverage_target() -> int:
    return MARKET_UNIVERSE_LIMIT * MARKET_UNIVERSE_PAGES


def _coverage_note(snapshot: UniverseSnapshot) -> str:
    if snapshot.source == "demo":
        return (
            f"Labeled demo snapshot ({len(snapshot.assets)} assets). "
            "Not live CoinGecko coverage, and not a CoinMarketCap clone."
        )
    target = _coverage_target()
    if snapshot.partial:
        return (
            f"Partial CoinGecko-tracked snapshot: {len(snapshot.assets)} of {target} assets "
            "(paginated /coins/markets; later pages were rate-limited or empty). "
            "Not every coin on every exchange, and not a CoinMarketCap clone."
        )
    return (
        f"CoinGecko-tracked snapshot of {len(snapshot.assets)} assets by market cap "
        f"(paginated /coins/markets, up to {target}). "
        "Not every coin on every exchange, and not a CoinMarketCap clone."
    )


async def _fetch_coingecko_market_universe() -> UniverseSnapshot | None:
    settings = get_settings()
    collected: list[MarketAsset] = []
    seen: set[str] = set()
    skipped = 0
    async with httpx.AsyncClient(timeout=12.0, headers=_headers()) as client:
        for page in range(1, MARKET_UNIVERSE_PAGES + 1):
            params = {
                "vs_currency": "usd",
                "order": "market_cap_desc",
                "per_page": MARKET_UNIVERSE_LIMIT,
                "page": page,
                "sparkline": "true",
                "price_change_percentage": "1h,24h,7d",
            }
            try:
                response = await _coingecko_get(client, f"{settings.coingecko_base_url}/coins/markets", params)
                payload = response.json()
            except Exception:
                if not collected:
                    raise
                skipped += 1
                logger.warning("CoinGecko markets page %s failed after retries; continuing for remaining pages", page)
                continue
            if not isinstance(payload, list) or not payload:
                if collected and skipped == 0:
                    break
                skipped += 1
                continue
            for item in payload:
                if not isinstance(item, dict) or not item.get("id"):
                    continue
                asset = market_asset_from_payload(item)
                if asset.id in seen:
                    continue
                seen.add(asset.id)
                collected.append(asset)
            if len(payload) < MARKET_UNIVERSE_LIMIT and skipped == 0:
                break
            if page < MARKET_UNIVERSE_PAGES:
                await _sleep(PAGE_GAP_SECONDS)
    if not collected:
        return None
    target = _coverage_target()
    partial = skipped > 0 or len(collected) < target
    reason = "rate_limited" if skipped else None
    return UniverseSnapshot(
        collected,
        "coingecko",
        last_live_at=_now_iso(),
        stale=False,
        fallback_reason=reason,
        partial=partial,
    )


async def get_ranked_markets(
    limit: int = 50,
    page: int = 1,
    sort: str = "market_cap",
    order: str = "desc",
    query: str | None = None,
) -> RankedMarkets:
    bounded_limit = max(1, min(int(limit), 100))
    bounded_page = max(1, min(int(page), 50))
    sort_key = normalize_sort(sort)
    order_key = normalize_order(order)
    snapshot = await get_universe_snapshot()
    filtered = _filter_assets(snapshot.assets, query)
    if query and query.strip() and not filtered:
        extra, extra_source = await get_asset_with_source(query.strip())
        if extra:
            filtered = [extra]
            if extra_source in VALID_SOURCES and snapshot.source != extra_source and extra_source != "demo":
                snapshot = UniverseSnapshot(
                    list(snapshot.assets),
                    extra_source,
                    snapshot.last_live_at,
                    snapshot.stale,
                    snapshot.fallback_reason,
                    snapshot.partial,
                )
    ranked = _sort_assets(filtered, sort_key, order_key)
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
        universe_size=len(snapshot.assets),
        coverage="universe",
        query=(query or "").strip() or None,
        coverage_note=_coverage_note(snapshot),
        partial=bool(snapshot.partial),
        coverage_target=_coverage_target(),
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
            response = await _coingecko_get(
                client,
                f"{settings.coingecko_base_url}/coins/{coin_id}/ohlc",
                {"vs_currency": "usd", "days": normalized_days},
            )
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


def ticker_from_payload(item: dict[str, Any]) -> ExchangeTicker | None:
    if not isinstance(item, dict):
        return None
    market = item.get("market") if isinstance(item.get("market"), dict) else {}
    exchange = str(market.get("name") or "").strip()
    base = str(item.get("base") or "").strip().upper()
    target = str(item.get("target") or "").strip().upper()
    if not exchange or not base or not target:
        return None
    converted_last = item.get("converted_last") if isinstance(item.get("converted_last"), dict) else {}
    converted_volume = item.get("converted_volume") if isinstance(item.get("converted_volume"), dict) else {}
    trade_url = item.get("trade_url")
    if trade_url and not str(trade_url).startswith(("http://", "https://")):
        trade_url = None
    trust = item.get("trust_score")
    trust_score = str(trust).strip().lower() if trust else None
    if trust_score not in {"green", "yellow", "red"}:
        trust_score = None
    return ExchangeTicker(
        exchange=exchange,
        exchange_id=str(market.get("identifier") or "") or None,
        pair=f"{base}/{target}",
        base=base,
        target=target,
        price_usd=_as_float(converted_last.get("usd")),
        last_price=_as_float(item.get("last")),
        volume_usd=_as_float(converted_volume.get("usd")),
        trust_score=trust_score,
        bid_ask_spread_percentage=_as_float(item.get("bid_ask_spread_percentage")),
        trade_url=str(trade_url) if trade_url else None,
        last_traded_at=str(item["last_traded_at"]) if item.get("last_traded_at") else None,
    )


def _empty_tickers(
    coin_id: str,
    page: int,
    limit: int,
    source: str,
    reason: str | None,
    *,
    query: str | None = None,
    min_volume: float | None = None,
    sort: str = "volume",
    order: str = "desc",
) -> AssetTickers:
    note = (
        "CoinGecko returned no tickers for this asset. CoinVigil does not scrape exchange websites or invent pairs."
        if source != "demo"
        else "Exchange listings are hidden in the labeled demo snapshot — pairs are never invented."
    )
    if reason == "rate_limited":
        note = "CoinGecko rate-limited ticker lookup. CoinVigil does not scrape exchanges or invent pairs."
    return AssetTickers(
        coin_id=coin_id,
        data=[],
        count=0,
        page=page,
        limit=limit,
        total=0,
        unique_exchange_count=0,
        venues=[],
        query=(query or "").strip() or None,
        min_volume=min_volume if min_volume and min_volume > 0 else None,
        sort=normalize_ticker_sort(sort),
        order=normalize_order(order),
        source=source,
        note=note,
        stale=source == "cache",
        fallback_reason=reason,
        last_live_at=None,
        as_of=_now_iso(),
    )


def _venue_summary(rows: list[ExchangeTicker]) -> tuple[int, list[str]]:
    seen: list[str] = []
    known: set[str] = set()
    for ticker in rows:
        name = ticker.exchange.strip()
        if not name or name in known:
            continue
        known.add(name)
        seen.append(name)
    return len(seen), seen[:12]


async def _fetch_coingecko_tickers(coin_id: str) -> list[ExchangeTicker]:
    settings = get_settings()
    collected: list[ExchangeTicker] = []
    seen: set[tuple[str, str]] = set()
    async with httpx.AsyncClient(timeout=12.0, headers=_headers()) as client:
        for page in range(1, TICKER_SOURCE_PAGES + 1):
            try:
                response = await _coingecko_get(
                    client,
                    f"{settings.coingecko_base_url}/coins/{coin_id}/tickers",
                    {"page": page, "order": "volume_desc", "include_exchange_logo": "false"},
                )
                payload = response.json()
            except Exception:
                if collected:
                    logger.warning("CoinGecko tickers page %s failed for %s after retries; continuing", page, coin_id)
                    continue
                raise
            raw = payload.get("tickers") if isinstance(payload, dict) else None
            if not isinstance(raw, list) or not raw:
                break
            for item in raw:
                ticker = ticker_from_payload(item) if isinstance(item, dict) else None
                if not ticker:
                    continue
                key = (ticker.exchange_id or ticker.exchange, ticker.pair)
                if key in seen:
                    continue
                seen.add(key)
                collected.append(ticker)
            if len(raw) < TICKER_PAGE_SIZE:
                break
    return collected


async def get_asset_tickers(
    coin_id: str,
    page: int = 1,
    limit: int = 25,
    query: str | None = None,
    min_volume: float | None = None,
    sort: str | None = None,
    order: str | None = None,
) -> AssetTickers:
    """CoinGecko coin tickers. Never invents exchange pairs."""
    needle = coin_id.strip().lower()
    bounded_limit = max(5, min(int(limit), 100))
    bounded_page = max(1, min(int(page), 20))
    sort_key = normalize_ticker_sort(sort)
    order_key = normalize_order(order)
    empty_kwargs = {
        "query": query,
        "min_volume": min_volume,
        "sort": sort_key,
        "order": order_key,
    }
    if not needle:
        return _empty_tickers("unknown", bounded_page, bounded_limit, "unavailable", "unreachable", **empty_kwargs)

    settings = get_settings()
    cache_key = f"tickers:v2:{needle}"
    mem = _memory_get(cache_key)
    rows: list[ExchangeTicker] | None = None
    source = "cache"
    last_live_at: str | None = None
    stale = False
    reason: str | None = None

    if isinstance(mem, dict) and isinstance(mem.get("items"), list):
        rows = [ExchangeTicker(**item) for item in mem["items"] if isinstance(item, dict)]
        source = str(mem.get("source") or "cache")
        last_live_at = mem.get("last_live_at")
        stale = bool(mem.get("stale"))

    if rows is None:
        cached = await cache_get(cache_key)
        if isinstance(cached, dict) and isinstance(cached.get("items"), list):
            rows = [ExchangeTicker(**item) for item in cached["items"] if isinstance(item, dict)]
            source = str(cached.get("source") or "cache")
            last_live_at = cached.get("last_live_at")
            envelope = {**cached, "stale": False}
            _memory_set(cache_key, envelope)

    if rows is None:
        try:
            rows = await _fetch_coingecko_tickers(needle)
            fetched_at = _now_iso()
            source = "coingecko"
            last_live_at = fetched_at
            envelope = {
                "items": [ticker.model_dump() for ticker in rows],
                "source": "coingecko",
                "last_live_at": fetched_at,
            }
            await cache_set(cache_key, envelope, settings.market_cache_ttl_seconds)
            await save_last_good(f"tickers:{needle}", envelope)
            _memory_set(cache_key, envelope)
        except Exception as exc:
            reason = _fallback_reason(exc)
            logger.warning("CoinGecko tickers unavailable for %s (%s)", needle, type(exc).__name__)
            last_good = await load_last_good(f"tickers:{needle}")
            if last_good and isinstance(last_good.get("items"), list):
                rows = [ExchangeTicker(**item) for item in last_good["items"] if isinstance(item, dict)]
                source = "cache"
                stale = True
                last_live_at = last_good.get("last_live_at")
            else:
                return _empty_tickers(
                    needle, bounded_page, bounded_limit, "demo" if reason else "unavailable", reason, **empty_kwargs
                )

    rows = rows or []
    needle_q = (query or "").strip().lower()
    filtered = rows
    if needle_q:
        filtered = [
            ticker
            for ticker in filtered
            if needle_q in ticker.exchange.lower()
            or needle_q in (ticker.exchange_id or "").lower()
            or needle_q in ticker.pair.lower()
        ]
    if min_volume is not None and min_volume > 0:
        filtered = [ticker for ticker in filtered if (ticker.volume_usd or 0) >= min_volume]
    ranked = sort_tickers(filtered, sort_key, order_key)
    page_rows = _slice_page(ranked, bounded_page, bounded_limit)
    unique_count, venues = _venue_summary(ranked)
    sort_labels = {
        "volume": "reported USD volume",
        "price": "last USD price",
        "spread": "bid-ask spread",
        "exchange": "exchange name",
        "pair": "trading pair",
        "trust": "CoinGecko trust score (green, yellow, red, then unscored)",
    }
    note = (
        f"CoinGecko ticker snapshot ({len(rows)} pairs across {_venue_summary(rows)[0]} venues "
        f"from up to {TICKER_SOURCE_PAGES} CoinGecko pages), sorted by {sort_labels.get(sort_key, sort_key)} "
        f"({order_key}). "
        "Reported volume can be inflated on some venues; trust scores are CoinGecko's when present. "
        "Not every venue worldwide, and CoinVigil does not scrape exchanges."
    )
    if needle_q or (min_volume or 0) > 0:
        note = (
            f"{note} Filter: "
            + ", ".join(
                part for part in (
                    f"venue/pair contains “{(query or '').strip()}”" if needle_q else "",
                    f"min 24h volume ${min_volume:,.0f}" if min_volume and min_volume > 0 else "",
                ) if part
            )
            + "."
        )
    if not rows:
        return _empty_tickers(
            needle, bounded_page, bounded_limit, source if source in VALID_SOURCES else "unavailable", reason, **empty_kwargs
        )
    if not ranked:
        return AssetTickers(
            coin_id=needle,
            data=[],
            count=0,
            page=bounded_page,
            limit=bounded_limit,
            total=0,
            unique_exchange_count=0,
            venues=[],
            query=(query or "").strip() or None,
            min_volume=min_volume if min_volume and min_volume > 0 else None,
            sort=sort_key,
            order=order_key,
            source=source if source in VALID_SOURCES else "cache",
            note="No CoinGecko tickers match this venue/volume filter. CoinVigil does not invent pairs.",
            last_live_at=last_live_at,
            as_of=last_live_at if stale else _now_iso(),
            stale=stale,
            fallback_reason=reason,
        )
    return AssetTickers(
        coin_id=needle,
        data=page_rows,
        count=len(page_rows),
        page=bounded_page,
        limit=bounded_limit,
        total=len(ranked),
        unique_exchange_count=unique_count,
        venues=venues,
        query=(query or "").strip() or None,
        min_volume=min_volume if min_volume and min_volume > 0 else None,
        sort=sort_key,
        order=order_key,
        source=source if source in VALID_SOURCES else "cache",
        note=note,
        last_live_at=last_live_at,
        as_of=last_live_at if stale else _now_iso(),
        stale=stale,
        fallback_reason=reason,
    )


def _pick_compared_asset(assets: list[MarketAsset], needle: str) -> MarketAsset | None:
    for asset in assets:
        if asset.id.lower() == needle:
            return asset
    for asset in assets:
        if asset.symbol.lower() == needle:
            return asset
    return None


async def compare_assets(ids: str | None) -> AssetCompare:
    """Side-by-side snapshot of up to 3 CoinGecko-tracked assets. Never invents missing coins."""
    requested = parse_compare_ids(ids)
    snapshot = await get_universe_snapshot()
    found: list[MarketAsset] = []
    missing: list[str] = []
    for needle in requested:
        match = _pick_compared_asset(snapshot.assets, needle)
        if match:
            found.append(match)
            continue
        asset, lookup_source = await get_asset_with_source(needle)
        if asset and (lookup_source != "demo" or snapshot.source == "demo"):
            found.append(asset)
        else:
            missing.append(needle)
    if not requested:
        note = (
            "Pick 2–3 CoinGecko ids (for example bitcoin,ethereum). "
            "CoinVigil does not invent assets to fill empty columns."
        )
    else:
        note = (
            f"Side-by-side from the CoinGecko-tracked snapshot ({len(snapshot.assets)} assets). "
            "Missing ids are omitted rather than invented."
        )
        if missing:
            note = f"{note} Not in this snapshot: {', '.join(missing)}."
    return AssetCompare(
        ids=requested,
        data=found,
        missing=missing,
        count=len(found),
        source=snapshot.source if snapshot.source in VALID_SOURCES else "unavailable",
        note=note,
        **_freshness_fields(snapshot),
    )
