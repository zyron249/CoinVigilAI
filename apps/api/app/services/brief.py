import asyncio
import json
import time
from typing import Any

from app.config import get_settings
from app.models import GlobalOverview, MarketAsset, MarketBrief, MarketMovers
from app.services.ai import _build_provider_calls, _extract_json
from app.services.cache import cache_get, cache_set
from app.services.market import get_global_overview, get_market_universe, get_movers

VALID_TONES = {"risk-on", "risk-off", "mixed", "neutral"}
BIAS_TO_TONE = {"bullish": "risk-on", "bearish": "risk-off", "neutral": "neutral"}
BRIEF_DISCLAIMER = (
    "AI-generated market brief from the latest CoinVigil snapshot. "
    "Informational research only — not financial advice."
)


def _pct(value: float | None) -> str:
    if value is None:
        return "n/a"
    return f"{value:+.2f}%"


def _compact(value: float | None) -> str:
    if value is None:
        return "n/a"
    abs_value = abs(value)
    if abs_value >= 1_000_000_000_000:
        return f"${value / 1_000_000_000_000:.2f}T"
    if abs_value >= 1_000_000_000:
        return f"${value / 1_000_000_000:.2f}B"
    if abs_value >= 1_000_000:
        return f"${value / 1_000_000:.2f}M"
    return f"${value:,.0f}"


def _asset_line(asset: MarketAsset) -> dict[str, Any]:
    return {
        "id": asset.id,
        "symbol": asset.symbol.upper(),
        "name": asset.name,
        "price": asset.current_price,
        "change_1h": asset.price_change_percentage_1h,
        "change_24h": asset.price_change_percentage_24h,
        "change_7d": asset.price_change_percentage_7d,
        "market_cap": asset.market_cap,
    }


def brief_facts(overview: GlobalOverview, movers: MarketMovers, assets: list[MarketAsset]) -> dict[str, Any]:
    scored = [asset for asset in assets if asset.price_change_percentage_24h is not None]
    advancing = sum(1 for asset in scored if (asset.price_change_percentage_24h or 0) > 0)
    declining = sum(1 for asset in scored if (asset.price_change_percentage_24h or 0) < 0)
    bitcoin = next((asset for asset in assets if asset.id == "bitcoin"), None)
    return {
        "data_source": overview.source,
        "coverage": overview.coverage,
        "note": overview.note,
        "global": {
            "total_market_cap_usd": overview.total_market_cap_usd,
            "total_volume_24h_usd": overview.total_volume_24h_usd,
            "market_cap_change_percentage_24h_usd": overview.market_cap_change_percentage_24h_usd,
            "btc_dominance": overview.btc_dominance,
            "eth_dominance": overview.eth_dominance,
            "fear_greed_value": overview.fear_greed_value,
            "fear_greed_classification": overview.fear_greed_classification,
            "fear_greed_source": overview.fear_greed_source,
        },
        "breadth": {
            "tracked": len(assets),
            "with_24h_change": len(scored),
            "advancing": advancing,
            "declining": declining,
        },
        "bitcoin": _asset_line(bitcoin) if bitcoin else None,
        "gainers": [_asset_line(asset) for asset in movers.gainers[:5]],
        "losers": [_asset_line(asset) for asset in movers.losers[:5]],
    }


def heuristic_market_brief(facts: dict[str, Any], data_source: str) -> MarketBrief:
    global_blob = facts.get("global") or {}
    breadth = facts.get("breadth") or {}
    bitcoin = facts.get("bitcoin") or {}
    gainers = facts.get("gainers") or []
    losers = facts.get("losers") or []
    mcap_change = global_blob.get("market_cap_change_percentage_24h_usd")
    tracked = max(int(breadth.get("with_24h_change") or 0), 1)
    advancing = int(breadth.get("advancing") or 0)
    advancing_share = advancing / tracked
    btc_change = bitcoin.get("change_24h")

    tone = "mixed"
    if mcap_change is not None:
        if mcap_change >= 2 and advancing_share >= 0.55:
            tone = "risk-on"
        elif mcap_change <= -2 and advancing_share <= 0.45:
            tone = "risk-off"
        elif abs(mcap_change) < 0.8 and 0.4 <= advancing_share <= 0.6:
            tone = "neutral"
    elif btc_change is not None:
        if btc_change >= 3 and advancing_share >= 0.55:
            tone = "risk-on"
        elif btc_change <= -3 and advancing_share <= 0.45:
            tone = "risk-off"
        elif abs(btc_change) < 1.2:
            tone = "neutral"

    top_gainer = gainers[0] if gainers else None
    top_loser = losers[0] if losers else None
    headline_map = {
        "risk-on": "Breadth leans constructive",
        "risk-off": "Defensive tape in the snapshot",
        "mixed": "Mixed tape across the ranked universe",
        "neutral": "Range-bound snapshot",
    }
    bullets = [
        f"Market cap { _compact(global_blob.get('total_market_cap_usd')) } "
        f"({_pct(mcap_change)} 24h) · 24h volume {_compact(global_blob.get('total_volume_24h_usd'))}.",
        f"BTC dominance {global_blob.get('btc_dominance') if global_blob.get('btc_dominance') is not None else 'n/a'}% · "
        f"ETH {global_blob.get('eth_dominance') if global_blob.get('eth_dominance') is not None else 'n/a'}%.",
        f"24h breadth: {advancing} advancing / {int(breadth.get('declining') or 0)} declining of {tracked} assets with a change print.",
    ]
    if top_gainer:
        bullets.append(
            f"Top 24h gainer in view: {top_gainer.get('symbol')} {_pct(top_gainer.get('change_24h'))}."
        )
    if top_loser:
        bullets.append(
            f"Top 24h loser in view: {top_loser.get('symbol')} {_pct(top_loser.get('change_24h'))}."
        )
    if global_blob.get("fear_greed_value") is not None:
        bullets.append(
            f"Fear & Greed {global_blob.get('fear_greed_value')} "
            f"({global_blob.get('fear_greed_classification')}) via {global_blob.get('fear_greed_source')}."
        )
    if data_source == "demo":
        bullets.append("This brief is based on a labeled demo snapshot, not live prices.")

    btc_bit = (
        f"Bitcoin is {_pct(btc_change)} over 24h. "
        if btc_change is not None
        else ""
    )
    summary = (
        f"{btc_bit}Quantitative tone is {tone} from breadth and the available market-cap change. "
        f"Source={data_source}. This is a snapshot, not a forecast."
    )
    return MarketBrief(
        headline=headline_map[tone],
        tone=tone,
        summary=summary.strip(),
        bullets=bullets,
        engine="heuristic",
        generated=False,
        data_source=data_source,
        disclaimer=BRIEF_DISCLAIMER,
    )


def brief_prompt(facts: dict[str, Any]) -> str:
    payload = {
        "task": (
            "Write a short crypto market brief as one member of CoinVigil's AI council. "
            "Use ONLY the supplied facts. Do not invent prices, news, TVL, RPC status, "
            "causes, or missing fields. Return strict JSON only."
        ),
        "facts": facts,
        "required_json": {
            "tone": "risk-on | risk-off | mixed | neutral",
            "headline": "short headline, no ticker spam",
            "summary": "2-3 sentences, evidence-constrained",
            "bullets": ["3-5 factual bullets"],
            "confidence": "integer 0-100",
        },
    }
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=False)


def normalize_brief_payload(payload: dict[str, Any]) -> dict[str, Any] | None:
    tone = str(payload.get("tone") or "").strip().lower()
    if tone not in VALID_TONES:
        tone = BIAS_TO_TONE.get(str(payload.get("bias") or "").strip().lower(), "")
    if tone not in VALID_TONES:
        return None
    headline = str(payload.get("headline") or "").strip() or f"{tone.replace('-', ' ').title()} snapshot"
    summary = str(payload.get("summary") or "").strip()
    if not summary:
        return None
    raw_bullets = payload.get("bullets") or []
    bullets = [str(item).strip() for item in raw_bullets if str(item).strip()][:6]
    if not bullets:
        bullets = [summary]
    try:
        confidence = int(round(float(payload.get("confidence", 55))))
    except (TypeError, ValueError):
        confidence = 55
    return {
        "tone": tone,
        "headline": headline[:160],
        "summary": summary[:1200],
        "bullets": bullets,
        "confidence": max(0, min(100, confidence)),
    }


async def _provider_brief(provider: str, model: str, call) -> dict[str, Any]:
    started = time.perf_counter()
    try:
        text = await call()
        parsed = normalize_brief_payload(_extract_json(text))
        latency_ms = int((time.perf_counter() - started) * 1000)
        if not parsed:
            return {"provider": provider, "model": model, "status": "invalid_response", "latency_ms": latency_ms}
        return {"provider": provider, "model": model, "status": "ok", "latency_ms": latency_ms, **parsed}
    except Exception as exc:
        return {
            "provider": provider,
            "model": model,
            "status": "error",
            "latency_ms": int((time.perf_counter() - started) * 1000),
            "error": f"{type(exc).__name__}: {str(exc)[:220]}",
        }


def _combine_brief(
    results: list[dict[str, Any]],
    requested: list[str],
    heuristic: MarketBrief,
) -> MarketBrief | None:
    valid = [row for row in results if row.get("status") == "ok" and row.get("tone") in VALID_TONES]
    if not valid:
        return None
    weights = get_settings().provider_weights
    tallies = {tone: 0.0 for tone in VALID_TONES}
    for row in valid:
        provider_weight = weights.get(str(row["provider"]).lower(), 1.0)
        tallies[row["tone"]] += provider_weight * max(0.25, (row.get("confidence") or 55) / 100)
    winner = max(tallies, key=tallies.get)
    preferred = next((row for row in valid if row["provider"] == "xai" and row["tone"] == winner), None)
    chosen = preferred or next((row for row in valid if row["tone"] == winner), valid[0])
    return MarketBrief(
        headline=chosen["headline"],
        tone=winner,
        summary=chosen["summary"],
        bullets=chosen["bullets"],
        engine=f"ai-council:{len(valid)}",
        generated=True,
        data_source=heuristic.data_source,
        providers_requested=requested,
        providers_responded=[row["provider"] for row in valid],
        disclaimer=BRIEF_DISCLAIMER,
    )


async def build_market_brief() -> MarketBrief:
    settings = get_settings()
    cache_key = "markets:v2:brief"
    cached = await cache_get(cache_key)
    if isinstance(cached, dict) and cached.get("headline") and cached.get("data_source"):
        return MarketBrief(**cached)

    overview = await get_global_overview()
    movers = await get_movers(5)
    assets, source = await get_market_universe()
    facts = brief_facts(overview, movers, assets)
    heuristic = heuristic_market_brief(facts, overview.source or source)

    brief = heuristic
    if settings.ai_council_enabled:
        calls = _build_provider_calls(brief_prompt(facts), settings)
        if calls:
            results = await asyncio.gather(
                *[_provider_brief(provider, model, call) for provider, model, call in calls]
            )
            combined = _combine_brief(list(results), [provider for provider, _, _ in calls], heuristic)
            if combined:
                brief = combined

    await cache_set(cache_key, brief.model_dump(), max(30, settings.market_cache_ttl_seconds))
    return brief
