import asyncio
import json
import re
import time
from typing import Awaitable, Callable

import httpx

from app.config import Settings, get_settings
from app.models import AICouncilDecision, AIProviderResult, MarketAsset, RiskAssessment


VALID_BIASES = {"bullish", "bearish", "neutral"}


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


def council_prompt(asset: MarketAsset, risk: RiskAssessment) -> str:
    payload = {
        "task": (
            "Act as one independent member of a crypto market intelligence council. "
            "Use ONLY the supplied market and risk facts. Do not invent news, causes, targets, "
            "guarantees, or missing data. Return strict JSON only."
        ),
        "asset": asset.model_dump(),
        "risk": risk.model_dump(),
        "required_json": {
            "bias": "bullish | bearish | neutral",
            "confidence": "integer 0-100",
            "summary": "1-3 concise sentences explaining the judgment and uncertainty",
        },
    }
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=False)


def _extract_json(text: str) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        value = json.loads(cleaned)
        return value if isinstance(value, dict) else {}
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
        if not match:
            return {}
        try:
            value = json.loads(match.group(0))
            return value if isinstance(value, dict) else {}
        except json.JSONDecodeError:
            return {}


def _normalize_provider_payload(payload: dict) -> tuple[str, int, str] | None:
    bias = str(payload.get("bias", "")).strip().lower()
    if bias not in VALID_BIASES:
        return None
    try:
        confidence = int(round(float(payload.get("confidence", 0))))
    except (TypeError, ValueError):
        return None
    confidence = max(0, min(100, confidence))
    summary = str(payload.get("summary", "")).strip()
    if not summary:
        summary = f"{bias.title()} assessment with {confidence}% model confidence."
    return bias, confidence, summary[:1200]


async def _execute_provider(
    provider: str,
    model: str,
    call: Callable[[], Awaitable[str]],
) -> AIProviderResult:
    started = time.perf_counter()
    try:
        text = await call()
        normalized = _normalize_provider_payload(_extract_json(text))
        latency_ms = int((time.perf_counter() - started) * 1000)
        if not normalized:
            return AIProviderResult(
                provider=provider,
                model=model,
                status="invalid_response",
                latency_ms=latency_ms,
                error="Provider did not return the required council JSON contract.",
            )
        bias, confidence, summary = normalized
        return AIProviderResult(
            provider=provider,
            model=model,
            status="ok",
            bias=bias,
            confidence=confidence,
            summary=summary,
            latency_ms=latency_ms,
        )
    except Exception as exc:
        latency_ms = int((time.perf_counter() - started) * 1000)
        return AIProviderResult(
            provider=provider,
            model=model,
            status="error",
            latency_ms=latency_ms,
            error=f"{type(exc).__name__}: {str(exc)[:220]}",
        )


async def _openai_response(prompt: str, settings: Settings) -> str:
    headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
        "Content-Type": "application/json",
    }
    body = {"model": settings.openai_model, "input": prompt}
    async with httpx.AsyncClient(timeout=settings.ai_request_timeout_seconds) as client:
        response = await client.post("https://api.openai.com/v1/responses", headers=headers, json=body)
        response.raise_for_status()
        data = response.json()
    texts: list[str] = []
    for item in data.get("output", []):
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if content.get("type") == "output_text" and content.get("text"):
                texts.append(content["text"])
    return "\n".join(texts).strip()


async def _openai_compatible_chat(
    prompt: str,
    api_key: str,
    model: str,
    base_url: str,
    timeout: float,
) -> str:
    url = f"{base_url.rstrip('/')}/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    body = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are an independent member of a multi-model financial intelligence council. "
                    "Return only the requested JSON and never invent unavailable facts."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.1,
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(url, headers=headers, json=body)
        response.raise_for_status()
        data = response.json()
    return str(data["choices"][0]["message"]["content"]).strip()


async def _gemini_response(prompt: str, settings: Settings) -> str:
    model = settings.gemini_model.removeprefix("models/")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    headers = {
        "x-goog-api-key": settings.gemini_api_key,
        "Content-Type": "application/json",
    }
    body = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"},
    }
    async with httpx.AsyncClient(timeout=settings.ai_request_timeout_seconds) as client:
        response = await client.post(url, headers=headers, json=body)
        response.raise_for_status()
        data = response.json()
    parts = data["candidates"][0]["content"]["parts"]
    return "\n".join(str(part.get("text", "")) for part in parts if part.get("text")).strip()


async def _anthropic_response(prompt: str, settings: Settings) -> str:
    headers = {
        "x-api-key": settings.anthropic_api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    body = {
        "model": settings.anthropic_model,
        "max_tokens": 700,
        "system": (
            "You are an independent member of a multi-model financial intelligence council. "
            "Return only the requested JSON and never invent unavailable facts."
        ),
        "messages": [{"role": "user", "content": prompt}],
    }
    async with httpx.AsyncClient(timeout=settings.ai_request_timeout_seconds) as client:
        response = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers=headers,
            json=body,
        )
        response.raise_for_status()
        data = response.json()
    return "\n".join(
        str(block.get("text", ""))
        for block in data.get("content", [])
        if block.get("type") == "text" and block.get("text")
    ).strip()


def provider_status() -> list[dict]:
    settings = get_settings()
    return [
        {"provider": "openai", "model": settings.openai_model, "configured": bool(settings.openai_api_key and settings.openai_model)},
        {"provider": "xai", "model": settings.xai_model, "configured": bool(settings.xai_api_key and settings.xai_model)},
        {"provider": "gemini", "model": settings.gemini_model, "configured": bool(settings.gemini_api_key and settings.gemini_model)},
        {"provider": "anthropic", "model": settings.anthropic_model, "configured": bool(settings.anthropic_api_key and settings.anthropic_model)},
        {"provider": "mistral", "model": settings.mistral_model, "configured": bool(settings.mistral_api_key and settings.mistral_model)},
        {"provider": "deepseek", "model": settings.deepseek_model, "configured": bool(settings.deepseek_api_key and settings.deepseek_model)},
        {"provider": "groq", "model": settings.groq_model, "configured": bool(settings.groq_api_key and settings.groq_model)},
        {"provider": "perplexity", "model": settings.perplexity_model, "configured": bool(settings.perplexity_api_key and settings.perplexity_model)},
        {"provider": "openrouter", "model": settings.openrouter_model, "configured": bool(settings.openrouter_api_key and settings.openrouter_model)},
    ]


def _build_provider_calls(
    prompt: str,
    settings: Settings,
) -> list[tuple[str, str, Callable[[], Awaitable[str]]]]:
    calls: list[tuple[str, str, Callable[[], Awaitable[str]]]] = []

    if settings.openai_api_key and settings.openai_model:
        calls.append(("openai", settings.openai_model, lambda: _openai_response(prompt, settings)))
    if settings.xai_api_key and settings.xai_model:
        calls.append((
            "xai",
            settings.xai_model,
            lambda: _openai_compatible_chat(
                prompt, settings.xai_api_key, settings.xai_model, settings.xai_base_url,
                settings.ai_request_timeout_seconds,
            ),
        ))
    if settings.gemini_api_key and settings.gemini_model:
        calls.append(("gemini", settings.gemini_model, lambda: _gemini_response(prompt, settings)))
    if settings.anthropic_api_key and settings.anthropic_model:
        calls.append(("anthropic", settings.anthropic_model, lambda: _anthropic_response(prompt, settings)))

    compatible = [
        ("mistral", settings.mistral_api_key, settings.mistral_model, settings.mistral_base_url),
        ("deepseek", settings.deepseek_api_key, settings.deepseek_model, settings.deepseek_base_url),
        ("groq", settings.groq_api_key, settings.groq_model, settings.groq_base_url),
        ("perplexity", settings.perplexity_api_key, settings.perplexity_model, settings.perplexity_base_url),
        ("openrouter", settings.openrouter_api_key, settings.openrouter_model, settings.openrouter_base_url),
    ]
    for name, api_key, model, base_url in compatible:
        if not api_key or not model:
            continue
        calls.append((
            name,
            model,
            lambda api_key=api_key, model=model, base_url=base_url: _openai_compatible_chat(
                prompt, api_key, model, base_url, settings.ai_request_timeout_seconds
            ),
        ))
    return calls


def _consensus(results: list[AIProviderResult], requested: list[str], settings: Settings) -> AICouncilDecision | None:
    valid = [result for result in results if result.status == "ok" and result.bias in VALID_BIASES]
    if not valid:
        return None

    votes = {bias: 0 for bias in ("bullish", "bearish", "neutral")}
    weighted = {bias: 0.0 for bias in votes}
    total_weight = 0.0
    confidence_weighted_sum = 0.0

    for result in valid:
        assert result.bias is not None
        confidence = result.confidence or 0
        provider_weight = settings.provider_weights.get(result.provider.lower(), 1.0)
        vote_weight = provider_weight * max(0.25, confidence / 100)
        votes[result.bias] += 1
        weighted[result.bias] += vote_weight
        total_weight += vote_weight
        confidence_weighted_sum += confidence * vote_weight

    winner = max(weighted, key=weighted.get)
    agreement = weighted[winner] / total_weight if total_weight else 0.0
    opposing_share = 0.0
    if winner == "bullish":
        opposing_share = weighted["bearish"] / total_weight if total_weight else 0.0
    elif winner == "bearish":
        opposing_share = weighted["bullish"] / total_weight if total_weight else 0.0

    final_bias = winner
    if agreement < 0.50 or opposing_share >= 0.35:
        final_bias = "neutral"

    avg_confidence = confidence_weighted_sum / total_weight if total_weight else 0.0
    final_confidence = int(round(min(95.0, avg_confidence * (0.55 + 0.45 * agreement))))
    responded = [result.provider for result in valid]
    dissent = [
        f"{result.provider}:{result.bias}"
        for result in valid
        if result.bias != final_bias
    ]
    vote_text = ", ".join(
        f"{bias}={votes[bias]}" for bias in ("bullish", "bearish", "neutral")
    )
    summary = (
        f"AI Council consensus is {final_bias} with {agreement * 100:.0f}% weighted agreement "
        f"across {len(valid)} responding model{'s' if len(valid) != 1 else ''}. "
        f"Votes: {vote_text}. The council is evidence-constrained and this output is not a guarantee."
    )
    return AICouncilDecision(
        bias=final_bias,
        confidence=final_confidence,
        agreement=round(agreement, 4),
        summary=summary,
        providers_requested=requested,
        providers_responded=responded,
        votes=votes,
        dissent=dissent,
        results=results,
    )


async def run_ai_council(asset: MarketAsset, risk: RiskAssessment) -> AICouncilDecision | None:
    settings = get_settings()
    if not settings.ai_council_enabled:
        return None

    prompt = council_prompt(asset, risk)
    calls = _build_provider_calls(prompt, settings)
    if not calls:
        return None

    results = await asyncio.gather(
        *[
            _execute_provider(provider, model, call)
            for provider, model, call in calls
        ]
    )
    return _consensus(results, [provider for provider, _, _ in calls], settings)
