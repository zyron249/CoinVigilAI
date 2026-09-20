from fastapi.testclient import TestClient

from app.main import app
from app.models import GlobalOverview, MarketBrief, MarketMovers, RankedMarkets
from app.services.market import DEMO_MARKETS


client = TestClient(app)


def test_health_reports_ok_and_honest_dependencies():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["dependencies"]["postgres"] == "not_provisioned"
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
    async def fake_ranked(limit=50, page=1, sort="market_cap", order="desc"):
        rows = DEMO_MARKETS[:limit]
        return RankedMarkets(
            data=rows,
            count=len(rows),
            page=page,
            limit=limit,
            total=len(DEMO_MARKETS),
            sort=sort,
            order=order,
            source="demo",
            universe_size=len(DEMO_MARKETS),
        )

    monkeypatch.setattr("app.main.get_ranked_markets", fake_ranked)
    response = client.get("/api/market?limit=2")
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "demo"
    assert body["count"] == 2
    assert body["data"][0]["id"] == "bitcoin"
    assert body["page"] == 1
    assert body["sort"] == "market_cap"


def test_global_endpoint_exposes_source(monkeypatch):
    async def fake_global():
        return GlobalOverview(
            total_market_cap_usd=100,
            total_volume_24h_usd=10,
            btc_dominance=50,
            source="demo",
            coverage="universe",
            note="Demo snapshot totals across the labeled fallback universe.",
        )

    monkeypatch.setattr("app.main.get_global_overview", fake_global)
    response = client.get("/api/market/global")
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "demo"
    assert body["coverage"] == "universe"
    assert body["fear_greed_value"] is None
    assert "demo" in body["note"].lower()


def test_movers_endpoint_exposes_source(monkeypatch):
    async def fake_movers(limit=5):
        return MarketMovers(gainers=DEMO_MARKETS[:1], losers=DEMO_MARKETS[-1:], count=1, source="cache")

    monkeypatch.setattr("app.main.get_movers", fake_movers)
    response = client.get("/api/market/movers?limit=1")
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "cache"
    assert body["gainers"][0]["id"] == "bitcoin"
    assert body["losers"][0]["id"] == DEMO_MARKETS[-1].id


def test_brief_endpoint_is_labeled_not_advice(monkeypatch):
    async def fake_brief():
        return MarketBrief(
            headline="Range-bound snapshot",
            tone="neutral",
            summary="Heuristic tone is neutral on a demo snapshot.",
            bullets=["Demo snapshot, not live prices."],
            engine="heuristic",
            generated=False,
            data_source="demo",
        )

    monkeypatch.setattr("app.main.build_market_brief", fake_brief)
    response = client.get("/api/market/brief")
    assert response.status_code == 200
    body = response.json()
    assert body["data_source"] == "demo"
    assert body["engine"] == "heuristic"
    assert body["generated"] is False
    assert "not financial advice" in body["disclaimer"].lower()


def test_news_configured_empty_explains_failure(monkeypatch):
    async def fake_news(limit=20):
        return []

    class FakeSettings:
        rss_urls = ["https://example.test/rss"]

    monkeypatch.setattr("app.main.get_news", fake_news)
    monkeypatch.setattr("app.main.get_settings", lambda: FakeSettings())
    response = client.get("/api/news")
    assert response.status_code == 200
    body = response.json()
    assert body["configured"] is True
    assert body["data"] == []
    assert "did not return stories" in body["message"]
