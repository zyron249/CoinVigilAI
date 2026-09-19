from app.models import MarketAsset
from app.services.risk import assess_risk


def test_stable_large_cap_is_low_risk():
    asset = MarketAsset(
        id="bitcoin",
        symbol="btc",
        name="Bitcoin",
        current_price=60000,
        market_cap=1_200_000_000_000,
        market_cap_rank=1,
        total_volume=30_000_000_000,
        high_24h=60500,
        low_24h=59500,
        price_change_percentage_24h=1.2,
    )
    risk = assess_risk(asset)
    assert risk.level == "low"
    assert 0 <= risk.score < 35


def test_extreme_move_and_thin_cap_raise_score():
    asset = MarketAsset(
        id="tiny",
        symbol="tiny",
        name="Tiny",
        current_price=1.0,
        market_cap=2_000_000,
        market_cap_rank=250,
        total_volume=2_000_000,
        high_24h=1.4,
        low_24h=0.7,
        price_change_percentage_24h=22.0,
    )
    risk = assess_risk(asset)
    assert risk.level == "high"
    assert risk.score >= 65
    assert any("Extreme" in driver for driver in risk.drivers)
