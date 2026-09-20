import asyncio
import unittest
from unittest.mock import patch

import httpx

from app.config import Settings
from app.models import AIProviderResult, MarketAsset, RiskAssessment
from app.services.ai import (
    XAI_DEFAULT_BASE_URL,
    XAI_DEFAULT_MODEL,
    _build_provider_calls,
    _consensus,
    _xai_response,
    provider_status,
    run_ai_council,
    xai_chat_completions_url,
)


def _settings(**overrides) -> Settings:
    return Settings(_env_file=None, **overrides)


def _asset() -> MarketAsset:
    return MarketAsset(
        id="bitcoin",
        symbol="btc",
        name="Bitcoin",
        current_price=100000.0,
        price_change_percentage_24h=1.25,
        market_cap=2_000_000_000_000,
        total_volume=40_000_000_000,
    )


def _risk() -> RiskAssessment:
    return RiskAssessment(score=42, level="moderate", drivers=["24h move is contained"])


class FakeResponse:
    def __init__(self, payload: dict, status_code: int = 200):
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            request = httpx.Request("POST", "https://api.x.ai/v1/chat/completions")
            response = httpx.Response(self.status_code, request=request)
            raise httpx.HTTPStatusError("xAI error", request=request, response=response)

    def json(self) -> dict:
        return self._payload


class FakeAsyncClient:
    last: "FakeAsyncClient | None" = None

    def __init__(self, *args, **kwargs):
        self.timeout = kwargs.get("timeout")
        self.calls: list[dict] = []
        self.payload = {
            "choices": [
                {
                    "message": {
                        "content": '{"bias":"neutral","confidence":64,"summary":"Grok mock vote."}'
                    }
                }
            ]
        }
        self.status_code = 200
        FakeAsyncClient.last = self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def post(self, url, headers=None, json=None):
        self.calls.append({"url": url, "headers": headers, "json": json})
        return FakeResponse(self.payload, self.status_code)


class XaiProviderWiringTests(unittest.TestCase):
    def test_official_chat_completions_url(self):
        self.assertEqual(
            xai_chat_completions_url(XAI_DEFAULT_BASE_URL),
            "https://api.x.ai/v1/chat/completions",
        )
        self.assertEqual(
            xai_chat_completions_url("https://api.x.ai/v1/"),
            "https://api.x.ai/v1/chat/completions",
        )

    def test_status_lists_grok_as_optional_when_key_missing(self):
        status = {item["provider"]: item for item in provider_status(_settings())}
        xai = status["xai"]
        self.assertEqual(xai["label"], "xAI Grok")
        self.assertEqual(xai["model"], XAI_DEFAULT_MODEL)
        self.assertEqual(xai["base_url"], XAI_DEFAULT_BASE_URL)
        self.assertEqual(xai["endpoint"], "https://api.x.ai/v1/chat/completions")
        self.assertTrue(xai["optional"])
        self.assertFalse(xai["configured"])

    def test_status_marks_grok_configured_when_key_present(self):
        settings = _settings(xai_api_key="xai-test", xai_model="grok-4.6")
        xai = next(item for item in provider_status(settings) if item["provider"] == "xai")
        self.assertTrue(xai["configured"])
        self.assertTrue(xai["optional"])

    def test_build_calls_skips_xai_without_key(self):
        calls = _build_provider_calls("prompt", _settings())
        self.assertEqual(calls, [])

    def test_build_calls_includes_only_xai_when_key_set(self):
        settings = _settings(xai_api_key="xai-test", xai_model="grok-4.6")
        calls = _build_provider_calls("prompt", settings)
        self.assertEqual([(name, model) for name, model, _ in calls], [("xai", "grok-4.6")])

    def test_xai_http_uses_official_endpoint_and_bearer_key(self):
        settings = _settings(xai_api_key="xai-test", xai_model="grok-4.6")
        with patch("app.services.ai.httpx.AsyncClient", FakeAsyncClient):
            text = asyncio.run(_xai_response("council-prompt", settings))
        self.assertIn("Grok mock vote", text)
        client = FakeAsyncClient.last
        assert client is not None
        self.assertEqual(len(client.calls), 1)
        call = client.calls[0]
        self.assertEqual(call["url"], "https://api.x.ai/v1/chat/completions")
        self.assertEqual(call["headers"]["Authorization"], "Bearer xai-test")
        self.assertEqual(call["json"]["model"], "grok-4.6")
        self.assertEqual(call["json"]["stream"], False)
        self.assertEqual(call["json"]["max_tokens"], 700)
        roles = [message["role"] for message in call["json"]["messages"]]
        self.assertEqual(roles, ["system", "user"])
        self.assertEqual(call["json"]["messages"][1]["content"], "council-prompt")

    def test_council_skips_gracefully_in_demo_mode_without_keys(self):
        decision = asyncio.run(run_ai_council(_asset(), _risk(), _settings()))
        self.assertIsNone(decision)

    def test_council_disabled_returns_none_even_with_key(self):
        settings = _settings(ai_council_enabled=False, xai_api_key="xai-test")
        decision = asyncio.run(run_ai_council(_asset(), _risk(), settings))
        self.assertIsNone(decision)

    def test_council_uses_mocked_xai_vote(self):
        settings = _settings(xai_api_key="xai-test", xai_model="grok-4.6")
        with patch("app.services.ai.httpx.AsyncClient", FakeAsyncClient):
            decision = asyncio.run(run_ai_council(_asset(), _risk(), settings))
        assert decision is not None
        self.assertEqual(decision.providers_requested, ["xai"])
        self.assertEqual(decision.providers_responded, ["xai"])
        self.assertEqual(decision.bias, "neutral")
        self.assertEqual(decision.results[0].provider, "xai")
        self.assertEqual(decision.results[0].model, "grok-4.6")
        self.assertEqual(decision.results[0].status, "ok")

    def test_http_error_fails_closed_without_breaking_council(self):
        settings = _settings(xai_api_key="xai-test", xai_model="grok-4.6")

        class ErrorClient(FakeAsyncClient):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, **kwargs)
                self.status_code = 401

        with patch("app.services.ai.httpx.AsyncClient", ErrorClient):
            decision = asyncio.run(run_ai_council(_asset(), _risk(), settings))
        self.assertIsNone(decision)

    def test_invalid_json_is_isolated_as_invalid_response(self):
        settings = _settings(xai_api_key="xai-test", xai_model="grok-4.6")

        class InvalidClient(FakeAsyncClient):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, **kwargs)
                self.payload = {"choices": [{"message": {"content": "not-json"}}]}

        with patch("app.services.ai.httpx.AsyncClient", InvalidClient):
            decision = asyncio.run(run_ai_council(_asset(), _risk(), settings))
        self.assertIsNone(decision)

    def test_consensus_accepts_xai_vote_alongside_other_providers(self):
        settings = _settings(ai_provider_weights_json='{"openai":1.2,"xai":1.1}')
        results = [
            AIProviderResult(
                provider="openai",
                model="test-openai",
                status="ok",
                bias="bullish",
                confidence=80,
                summary="bullish",
            ),
            AIProviderResult(
                provider="xai",
                model="grok-4.6",
                status="ok",
                bias="bullish",
                confidence=74,
                summary="bullish",
            ),
            AIProviderResult(
                provider="gemini",
                model="test-gemini",
                status="error",
                error="timeout",
            ),
        ]
        decision = _consensus(results, ["openai", "xai", "gemini"], settings)
        assert decision is not None
        self.assertEqual(decision.bias, "bullish")
        self.assertEqual(decision.providers_responded, ["openai", "xai"])
        self.assertIn("xai", decision.providers_requested)


if __name__ == "__main__":
    unittest.main()
