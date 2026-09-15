from app.models import MarketAsset, RiskAssessment


def assess_risk(asset: MarketAsset) -> RiskAssessment:
    score = 25
    drivers: list[str] = []

    change = abs(asset.price_change_percentage_24h or 0)
    if change >= 15:
        score += 35
        drivers.append("Extreme 24h price movement")
    elif change >= 8:
        score += 22
        drivers.append("High 24h volatility")
    elif change >= 4:
        score += 10
        drivers.append("Elevated 24h volatility")

    if asset.market_cap_rank and asset.market_cap_rank > 100:
        score += 18
        drivers.append("Lower market-cap ranking")
    elif asset.market_cap_rank and asset.market_cap_rank > 30:
        score += 8
        drivers.append("Mid/low market-cap ranking")

    if asset.market_cap and asset.total_volume:
        turnover = asset.total_volume / max(asset.market_cap, 1)
        if turnover > 0.6:
            score += 18
            drivers.append("Unusually high volume relative to market cap")
        elif turnover < 0.01:
            score += 12
            drivers.append("Low trading turnover")

    if asset.high_24h and asset.low_24h and asset.current_price:
        intraday_range = (asset.high_24h - asset.low_24h) / max(asset.current_price, 1e-9)
        if intraday_range > 0.15:
            score += 12
            drivers.append("Wide intraday trading range")

    score = max(0, min(score, 100))
    level = "low" if score < 35 else "medium" if score < 65 else "high"
    if not drivers:
        drivers.append("No major quantitative risk flags detected in current snapshot")
    return RiskAssessment(score=score, level=level, drivers=drivers)
