from app.models import GlobalOverview, MarketMovers
from app.services.brief import (
    BRIEF_DISCLAIMER,
    brief_facts,
    build_market_brief,
    heuristic_market_brief,
    normalize_brief_payload,
)
from app.services.market import DEMO_MARKETS


def _facts(source: str = "demo") -> dict:
    overview = GlobalOverview(
        total_market_cap_usd=1_800_000_000_000,
        total_volume_24h_usd=80_000_000_000,
        market_cap_change_percentage_24h_usd=1.4,
        btc_dominance=54.2,
        eth_dominance=16.1,
        active_cryptocurrencies=8,
        source=source,
        coverage="universe",
        note="fixture",
    )
    movers = MarketMovers(
        gainers=sorted(DEMO_MARKETS, key=lambda asset: asset.price_change_percentage_24h or 0, reverse=True)[:3],
        losers=sorted(DEMO_MARKETS, key=lambda asset: asset.price_change_percentage_24h or 0)[:3],
        count=3,
        source=source,
    )
    return brief_facts(overview, movers, list(DEMO_MARKETS))


def test_heuristic_brief_is_labeled_and_not_advice():
    brief = heuristic_market_brief(_facts("demo"), "demo")
    assert brief.engine == "heuristic"
    assert brief.generated is False
    assert brief.data_source == "demo"
    assert brief.tone in {"risk-on", "risk-off", "mixed", "neutral"}
    assert "not financial advice" in brief.disclaimer.lower()
    assert any("demo" in bullet.lower() for bullet in brief.bullets)
    assert "live prices" in " ".join(brief.bullets).lower()


def test_heuristic_brief_does_not_claim_coingecko_when_demo():
    brief = heuristic_market_brief(_facts("demo"), "demo")
    assert brief.data_source != "coingecko"
    assert "coingecko" not in brief.summary.lower()


def test_normalize_brief_accepts_tone_and_bias_alias():
    parsed = normalize_brief_payload({
        "bias": "bullish",
        "headline": "Constructive breadth",
        "summary": "Advancers lead the ranked snapshot.",
        "bullets": ["BTC is offered as +2.8% in the facts."],
        "confidence": 70,
    })
    assert parsed is not None
    assert parsed["tone"] == "risk-on"
    assert parsed["headline"] == "Constructive breadth"


def test_normalize_brief_rejects_empty_summary():
    assert normalize_brief_payload({"tone": "mixed", "summary": "  "}) is None


async def test_build_market_brief_falls_back_without_keys(monkeypatch):
    async def fake_global():
        return GlobalOverview(
            total_market_cap_usd=100,
            total_volume_24h_usd=10,
            source="demo",
            coverage="universe",
            note="fixture",
        )

    async def fake_movers(limit=5):
        return MarketMovers(gainers=DEMO_MARKETS[:2], losers=list(reversed(DEMO_MARKETS[:2])), count=2, source="demo")

    async def fake_universe():
        return list(DEMO_MARKETS), "demo"

    monkeypatch.setattr("app.services.brief.get_global_overview", fake_global)
    monkeypatch.setattr("app.services.brief.get_movers", fake_movers)
    monkeypatch.setattr("app.services.brief.get_market_universe", fake_universe)

    brief = await build_market_brief()
    assert brief.engine == "heuristic"
    assert brief.generated is False
    assert brief.data_source == "demo"
    assert BRIEF_DISCLAIMER in brief.disclaimer


async def test_build_market_brief_uses_mocked_council(monkeypatch):
    async def fake_global():
        return GlobalOverview(source="cache", coverage="universe", note="cached fixture")

    async def fake_movers(limit=5):
        return MarketMovers(gainers=DEMO_MARKETS[:1], losers=DEMO_MARKETS[-1:], count=1, source="cache")

    async def fake_universe():
        return list(DEMO_MARKETS), "cache"

    async def fake_xai():
        return '{"tone":"mixed","headline":"Range-bound council view","summary":"Models see mixed breadth in the supplied snapshot.","bullets":["BTC 24h is taken from facts only."],"confidence":64}'

    monkeypatch.setattr("app.services.brief.get_global_overview", fake_global)
    monkeypatch.setattr("app.services.brief.get_movers", fake_movers)
    monkeypatch.setattr("app.services.brief.get_market_universe", fake_universe)
    monkeypatch.setattr(
        "app.services.brief._build_provider_calls",
        lambda prompt, settings: [("xai", "grok-4.6", fake_xai)],
    )

    brief = await build_market_brief()
    assert brief.generated is True
    assert brief.engine == "ai-council:1"
    assert brief.tone == "mixed"
    assert brief.headline == "Range-bound council view"
    assert brief.providers_responded == ["xai"]
    assert "not financial advice" in brief.disclaimer.lower()
    assert brief.data_source == "cache"
