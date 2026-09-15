from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.models import AssetAnalysis, RadarSignal
from app.services.ai import deterministic_view, llm_summary
from app.services.market import get_asset, get_markets
from app.services.news import get_news
from app.services.risk import assess_risk

app = FastAPI(
    title="CoinVigil AI API",
    version="0.1.0",
    description="24/7 AI-powered crypto market intelligence API",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "coinvigil-api", "version": "0.1.0"}


@app.get("/api/market")
async def market(limit: int = Query(20, ge=1, le=100)):
    assets = await get_markets(limit)
    return {"data": [asset.model_dump() for asset in assets], "count": len(assets)}


@app.get("/api/assets/{coin_id}/analysis", response_model=AssetAnalysis)
async def asset_analysis(coin_id: str):
    asset = await get_asset(coin_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    risk = assess_risk(asset)
    bias, confidence, fallback_summary = deterministic_view(asset, risk)
    ai_summary = await llm_summary(asset, risk)

    return AssetAnalysis(
        asset=asset,
        bias=bias,
        confidence=confidence,
        risk=risk,
        summary=ai_summary or fallback_summary,
        engine="openai" if ai_summary else "heuristic",
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
    items = get_news(limit)
    return {
        "data": items,
        "count": len(items),
        "configured": bool(items),
        "message": None if items else "Add comma-separated RSS URLs to NEWS_RSS_URLS to activate the intelligence feed.",
    }
