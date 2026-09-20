from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.models import AssetAnalysis, GlobalOverview, MarketBrief, MarketMovers, RadarSignal, RankedMarkets
from app.services.ai import deterministic_view, provider_status, run_ai_council
from app.services.brief import build_market_brief
from app.services.cache import redis_status
from app.services.market import (
    get_asset_with_source,
    get_candles,
    get_global_overview,
    get_markets,
    get_movers,
    get_ranked_markets,
    snap_ohlc_days,
)
from app.services.news import get_news
from app.services.risk import assess_risk

settings = get_settings()

app = FastAPI(
    title="CoinVigil AI API",
    version="0.4.0",
    description="AI-supported crypto market intelligence — CoinGecko rankings, not a CoinMarketCap clone.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    providers = provider_status()
    return {
        "status": "ok",
        "service": "coinvigil-api",
        "version": "0.4.0",
        "dependencies": {
            "redis": await redis_status(),
            "postgres": "not_provisioned",
            "market_provider": "coingecko",
            "ai_providers_configured": sum(1 for provider in providers if provider["configured"]),
        },
    }


@app.get("/api/ai/council/status")
async def ai_council_status():
    settings = get_settings()
    providers = provider_status()
    return {
        "enabled": settings.ai_council_enabled,
        "supported": len(providers),
        "configured": sum(1 for provider in providers if provider["configured"]),
        "providers": providers,
        "mode": "parallel_weighted_consensus",
    }


@app.get("/api/market", response_model=RankedMarkets)
async def market(
    limit: int = Query(50, ge=1, le=100),
    page: int = Query(1, ge=1, le=50),
    sort: str = Query("market_cap"),
    order: str = Query("desc"),
):
    return await get_ranked_markets(limit=limit, page=page, sort=sort, order=order)


@app.get("/api/market/global", response_model=GlobalOverview)
async def market_global():
    return await get_global_overview()


@app.get("/api/market/movers", response_model=MarketMovers)
async def market_movers(limit: int = Query(5, ge=1, le=15)):
    return await get_movers(limit)


@app.get("/api/market/brief", response_model=MarketBrief)
async def market_brief():
    return await build_market_brief()


@app.get("/api/assets/{coin_id}/candles")
async def asset_candles(coin_id: str, days: int = Query(90, ge=1, le=365)):
    candles, source = await get_candles(coin_id, days)
    if not candles:
        raise HTTPException(status_code=404, detail="Candle data unavailable")
    return {
        "data": [candle.model_dump() for candle in candles],
        "count": len(candles),
        "source": source,
        "days": snap_ohlc_days(days),
    }


@app.get("/api/assets/{coin_id}/analysis", response_model=AssetAnalysis)
async def asset_analysis(coin_id: str):
    asset, data_source = await get_asset_with_source(coin_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    risk = assess_risk(asset)
    heuristic_bias, heuristic_confidence, fallback_summary = deterministic_view(asset, risk)
    council = await run_ai_council(asset, risk)

    if council:
        return AssetAnalysis(
            asset=asset,
            bias=council.bias,
            confidence=council.confidence,
            risk=risk,
            summary=council.summary,
            engine=f"ai-council:{len(council.providers_responded)}",
            council=council,
            data_source=data_source,
        )

    return AssetAnalysis(
        asset=asset,
        bias=heuristic_bias,
        confidence=heuristic_confidence,
        risk=risk,
        summary=fallback_summary,
        engine="heuristic",
        council=None,
        data_source=data_source,
    )


@app.get("/api/radar")
async def radar(limit: int = Query(30, ge=3, le=100)):
    assets = await get_markets(limit)
    signals: list[RadarSignal] = []

    for asset in assets:
        change = asset.price_change_percentage_24h or 0
        risk = assess_risk(asset)
        if abs(change) < 3 and risk.score < 55:
            continue

        signal = "Momentum spike" if change >= 3 else "Selloff pressure" if change <= -3 else "Risk anomaly"
        severity = "critical" if abs(change) >= 12 or risk.score >= 80 else "high" if abs(change) >= 7 or risk.score >= 65 else "medium"
        signals.append(RadarSignal(
            asset_id=asset.id,
            symbol=asset.symbol.upper(),
            name=asset.name,
            signal=signal,
            severity=severity,
            change_24h=round(change, 2),
            risk_score=risk.score,
        ))

    signals.sort(key=lambda item: (item.severity == "critical", item.severity == "high", abs(item.change_24h)), reverse=True)
    return {"data": [signal.model_dump() for signal in signals[:15]], "count": min(len(signals), 15)}


@app.get("/api/news")
async def news(limit: int = Query(20, ge=1, le=100)):
    items = await get_news(limit)
    configured = bool(get_settings().rss_urls)
    return {
        "data": items,
        "count": len(items),
        "configured": configured,
        "message": None if items else (
            "Configured RSS feeds did not return stories. Check NEWS_RSS_URLS and try again."
            if configured
            else "Add comma-separated RSS URLs to NEWS_RSS_URLS to activate the intelligence feed."
        ),
    }
