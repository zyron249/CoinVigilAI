from fastapi.testclient import TestClient

from app.main import app
from app.services.market import DEMO_MARKETS


client = TestClient(app)


def test_health_reports_ok_and_honest_dependencies():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["dependencies"]["postgres"] == "reserved_unused"
    assert body["dependencies"]["market_provider"] == "coingecko"
    assert "redis" in body["dependencies"]


def test_council_status_lists_supported_providers():
    response = client.get("/api/ai/council/status")
    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is True
    assert body["supported"] >= 9
    assert body["configured"] == 0


def test_news_empty_without_rss_config():
    response = client.get("/api/news")
    assert response.status_code == 200
    body = response.json()
    assert body["data"] == []
    assert body["configured"] is False
    assert "NEWS_RSS_URLS" in body["message"]


def test_candles_report_snapped_coingecko_days(monkeypatch):
    async def fake_candles(coin_id: str, days: int = 90):
        from app.models import Candle
        return [Candle(timestamp=1, open=1, high=2, low=0.5, close=1.2)], "demo"

    monkeypatch.setattr("app.main.get_candles", fake_candles)
    response = client.get("/api/assets/bitcoin/candles?days=45")
    assert response.status_code == 200
    body = response.json()
    assert body["days"] == 30
    assert body["source"] == "demo"
    assert body["count"] == 1


def test_market_source_is_exposed(monkeypatch):
    async def fake_markets(limit=20):
        return DEMO_MARKETS[:limit], "demo"

    monkeypatch.setattr("app.main.get_markets_with_source", fake_markets)
    response = client.get("/api/market?limit=2")
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "demo"
    assert body["count"] == 2
    assert body["data"][0]["id"] == "bitcoin"
