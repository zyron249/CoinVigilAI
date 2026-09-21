import pytest

from app.services.sentiment import headline_polarity, score_watchlist_headlines, watchlist_sentiment


def test_headline_polarity_is_lexicon_only():
    assert headline_polarity("Bitcoin rally hits record highs") == 1
    assert headline_polarity("Exchange hack sparks a crash") == -1
    assert headline_polarity("Committee schedules a hearing") == 0


def test_unrelated_headlines_are_unavailable():
    out = score_watchlist_headlines(
        [{"id": "bitcoin", "symbol": "btc", "name": "Bitcoin"}],
        [{"title": "Sports league signs a new coach", "source": "Fixture"}],
    )
    assert out["available"] is False
    assert "sentiment unavailable" in out["reason"]
    assert out["items"] == []


def test_watchlist_headline_can_lean_without_nlp():
    out = score_watchlist_headlines(
        [{"id": "bitcoin", "symbol": "btc", "name": "Bitcoin"}],
        [{"title": "Bitcoin rally continues after ETF inflows", "source": "Fixture", "link": "https://example.com/a"}],
    )
    assert out["available"] is True
    assert out["engine"] == "headline-heuristic"
    assert out["lean"] == "bullish"
    assert out["items"][0]["coin_id"] == "bitcoin"


@pytest.mark.asyncio
async def test_empty_rss_is_unavailable(monkeypatch):
    async def fake_news(limit=30):
        return []

    monkeypatch.setattr("app.services.sentiment.get_news", fake_news)
    out = await watchlist_sentiment([{"id": "bitcoin", "symbol": "btc", "name": "Bitcoin"}])
    assert out["available"] is False
    assert "no news feeds" in out["reason"]
