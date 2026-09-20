from pydantic import BaseModel, ConfigDict, Field


class MarketAsset(BaseModel):
    model_config = ConfigDict(extra="ignore")

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
    price_change_percentage_1h: float | None = None
    price_change_percentage_7d: float | None = None
    circulating_supply: float | None = None
    total_supply: float | None = None
    max_supply: float | None = None
    fully_diluted_valuation: float | None = None
    sparkline_7d: list[float] = Field(default_factory=list)
    last_updated: str | None = None


class RankedMarkets(BaseModel):
    data: list[MarketAsset]
    count: int
    page: int
    limit: int
    total: int
    sort: str
    order: str
    source: str
    universe_size: int
    coverage: str = "universe"


class GlobalOverview(BaseModel):
    total_market_cap_usd: float | None = None
    total_volume_24h_usd: float | None = None
    market_cap_change_percentage_24h_usd: float | None = None
    btc_dominance: float | None = None
    eth_dominance: float | None = None
    active_cryptocurrencies: int | None = None
    fear_greed_value: int | None = None
    fear_greed_classification: str | None = None
    fear_greed_source: str | None = None
    source: str
    coverage: str
    note: str | None = None
    updated_at: int | None = None


class MarketMovers(BaseModel):
    gainers: list[MarketAsset]
    losers: list[MarketAsset]
    count: int
    source: str


class MarketBrief(BaseModel):
    headline: str
    tone: str
    summary: str
    bullets: list[str]
    engine: str
    generated: bool
    data_source: str
    providers_requested: list[str] = Field(default_factory=list)
    providers_responded: list[str] = Field(default_factory=list)
    disclaimer: str = (
        "Informational research only — not financial advice."
    )


class Candle(BaseModel):
    timestamp: int
    open: float
    high: float
    low: float
    close: float
    volume: float = 0


class RiskAssessment(BaseModel):
    score: int = Field(ge=0, le=100)
    level: str
    drivers: list[str]


class AIProviderResult(BaseModel):
    provider: str
    model: str
    status: str
    bias: str | None = None
    confidence: int | None = Field(default=None, ge=0, le=100)
    summary: str | None = None
    latency_ms: int = 0
    error: str | None = None


class AICouncilDecision(BaseModel):
    bias: str
    confidence: int = Field(ge=0, le=100)
    agreement: float = Field(ge=0, le=1)
    summary: str
    providers_requested: list[str]
    providers_responded: list[str]
    votes: dict[str, int]
    dissent: list[str]
    results: list[AIProviderResult]


class AssetAnalysis(BaseModel):
    asset: MarketAsset
    bias: str
    confidence: int = Field(ge=0, le=100)
    risk: RiskAssessment
    summary: str
    engine: str
    council: AICouncilDecision | None = None
    data_source: str = "unknown"
    disclaimer: str = "AI output is informational research, not financial advice."


class RadarSignal(BaseModel):
    asset_id: str
    symbol: str
    name: str
    signal: str
    severity: str
    change_24h: float
    risk_score: int
