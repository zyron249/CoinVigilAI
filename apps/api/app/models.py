from pydantic import BaseModel, Field


class MarketAsset(BaseModel):
    id: str
    symbol: str
    name: str
    image: str | None = None
    current_price: float | None = None
    market_cap: float | None = None
    market_cap_rank: int | None = None
    total_volume: float | None = None
    high_24h: float | None = None
    low_24h: float | None = None
    price_change_percentage_24h: float | None = None


class RiskAssessment(BaseModel):
    score: int = Field(ge=0, le=100)
    level: str
    drivers: list[str]


class AssetAnalysis(BaseModel):
    asset: MarketAsset
    bias: str
    confidence: int = Field(ge=0, le=100)
    risk: RiskAssessment
    summary: str
    engine: str


class RadarSignal(BaseModel):
    asset_id: str
    symbol: str
    name: str
    signal: str
    severity: str
    change_24h: float
    risk_score: int
