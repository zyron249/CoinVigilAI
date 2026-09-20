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
    ath: float | None = None
    ath_change_percentage: float | None = None
    ath_date: str | None = None
    atl: float | None = None
    atl_change_percentage: float | None = None
    atl_date: str | None = None
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
    query: str | None = None
    coverage_note: str = (
        "CoinGecko-tracked snapshot by market cap — not every coin on every exchange."
    )
    partial: bool = False
    coverage_target: int = 1000
    last_live_at: str | None = None
    as_of: str | None = None
    stale: bool = False
    fallback_reason: str | None = None


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
    last_live_at: str | None = None
    as_of: str | None = None
    stale: bool = False
    fallback_reason: str | None = None


class MarketMovers(BaseModel):
    gainers: list[MarketAsset]
    losers: list[MarketAsset]
    count: int
    source: str
    last_live_at: str | None = None
    as_of: str | None = None
    stale: bool = False
    fallback_reason: str | None = None


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


class ExchangeTicker(BaseModel):
    exchange: str
    exchange_id: str | None = None
    pair: str
    base: str
    target: str
    price_usd: float | None = None
    last_price: float | None = None
    volume_usd: float | None = None
    trust_score: str | None = None
    bid_ask_spread_percentage: float | None = None
    trade_url: str | None = None
    last_traded_at: str | None = None


class AssetTickers(BaseModel):
    coin_id: str
    data: list[ExchangeTicker]
    count: int
    page: int
    limit: int
    total: int
    unique_exchange_count: int = 0
    venues: list[str] = Field(default_factory=list)
    query: str | None = None
    min_volume: float | None = None
    sort: str = "volume"
    order: str = "desc"
    source: str
    coverage: str = "coingecko_tickers"
    note: str
    last_live_at: str | None = None
    as_of: str | None = None
    stale: bool = False
    fallback_reason: str | None = None


class AssetCompare(BaseModel):
    ids: list[str] = Field(default_factory=list)
    data: list[MarketAsset] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)
    count: int = 0
    source: str
    note: str
    last_live_at: str | None = None
    as_of: str | None = None
    stale: bool = False
    fallback_reason: str | None = None


class ProjectLink(BaseModel):
    kind: str
    label: str
    url: str


class AssetContract(BaseModel):
    platform: str
    label: str
    address: str
    explorer_url: str | None = None


class AssetProfile(BaseModel):
    coin_id: str
    links: list[ProjectLink] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)
    description: str | None = None
    genesis_date: str | None = None
    contracts: list[AssetContract] = Field(default_factory=list)
    source: str
    note: str
    last_live_at: str | None = None
    as_of: str | None = None
    stale: bool = False
    fallback_reason: str | None = None


class RadarSignal(BaseModel):
    asset_id: str
    symbol: str
    name: str
    signal: str
    severity: str
    change_24h: float
    risk_score: int
