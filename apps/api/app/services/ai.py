import json
import httpx
from app.config import get_settings
from app.models import MarketAsset, RiskAssessment


def deterministic_view(asset: MarketAsset, risk: RiskAssessment) -> tuple[str, int, str]:
    change = asset.price_change_percentage_24h or 0
    if change >= 3:
        bias = "bullish"
    elif change <= -3:
        bias = "bearish"
    else:
        bias = "neutral"

    confidence = min(88, 55 + int(abs(change) * 3))
    summary = (
        f"{asset.name} is {change:+.2f}% over 24h. "
        f"Current quantitative bias is {bias}, while the risk model rates conditions as "
        f"{risk.level} ({risk.score}/100). This is a market snapshot, not a price prediction."
    )
    return bias, confidence, summary


async def llm_summary(asset: MarketAsset, risk: RiskAssessment) -> str | None:
    settings = get_settings()
    if not settings.openai_api_key:
        return None

    prompt = {
        "task": "Write a concise crypto market intelligence note using only the supplied facts. Do not invent news, causes, targets, or guarantees.",
        "asset": asset.model_dump(),
        "risk": risk.model_dump(),
        "format": "2-4 sentences. Mention uncertainty and distinguish observed facts from interpretation.",
    }

    headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
        "Content-Type": "application/json",
    }
    body = {
        "model": settings.openai_model,
        "input": json.dumps(prompt),
    }

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await client.post("https://api.openai.com/v1/responses", headers=headers, json=body)
            response.raise_for_status()
            data = response.json()
            for item in data.get("output", []):
                if item.get("type") != "message":
                    continue
                for content in item.get("content", []):
                    if content.get("type") == "output_text" and content.get("text"):
                        return content["text"].strip()
    except Exception:
        return None
    return None
