from app.config import Settings
from app.models import AIProviderResult
from app.services.ai import _consensus, _extract_json, _normalize_provider_payload


def test_weighted_majority_is_bullish():
    settings = Settings(_env_file=None, ai_provider_weights_json='{"openai":1.2,"xai":1.0,"gemini":1.0}')
    results = [
        AIProviderResult(provider="openai", model="test-openai", status="ok", bias="bullish", confidence=82, summary="bullish"),
        AIProviderResult(provider="xai", model="test-xai", status="ok", bias="bullish", confidence=76, summary="bullish"),
        AIProviderResult(provider="gemini", model="test-gemini", status="ok", bias="bearish", confidence=55, summary="bearish"),
    ]
    decision = _consensus(results, ["openai", "xai", "gemini"], settings)
    assert decision is not None
    assert decision.bias == "bullish"
    assert decision.votes == {"bullish": 2, "bearish": 1, "neutral": 0}


def test_strong_disagreement_forces_neutral():
    conflict = [
        AIProviderResult(provider="openai", model="a", status="ok", bias="bullish", confidence=80, summary="bullish"),
        AIProviderResult(provider="xai", model="b", status="ok", bias="bearish", confidence=80, summary="bearish"),
    ]
    decision = _consensus(conflict, ["openai", "xai"], Settings(_env_file=None))
    assert decision is not None
    assert decision.bias == "neutral"
    assert "openai:bullish" in decision.dissent
    assert "xai:bearish" in decision.dissent


def test_no_valid_votes_returns_none():
    results = [
        AIProviderResult(provider="openai", model="a", status="error", error="timeout"),
    ]
    assert _consensus(results, ["openai"], Settings(_env_file=None)) is None


def test_extracts_json_from_fenced_payload():
    payload = _extract_json('```json\n{"bias":"neutral","confidence":40,"summary":"range-bound"}\n```')
    normalized = _normalize_provider_payload(payload)
    assert normalized == ("neutral", 40, "range-bound")


def test_rejects_invalid_bias():
    assert _normalize_provider_payload({"bias": "moon", "confidence": 90, "summary": "nope"}) is None
