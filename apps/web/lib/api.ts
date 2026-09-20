export type MarketAsset = {
  id: string;
  symbol: string;
  name: string;
  image?: string | null;
  current_price?: number | null;
  market_cap?: number | null;
  market_cap_rank?: number | null;
  total_volume?: number | null;
  high_24h?: number | null;
  low_24h?: number | null;
  price_change_percentage_24h?: number | null;
};

export type Candle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type RiskAssessment = {
  score: number;
  level: string;
  drivers: string[];
};

export type CouncilProvider = {
  provider: string;
  label: string;
  model: string;
  configured: boolean;
  optional: boolean;
  endpoint?: string;
};

export type CouncilProviderResult = {
  provider: string;
  model: string;
  status: string;
  bias?: string | null;
  confidence?: number | null;
  summary?: string | null;
  latency_ms?: number;
  error?: string | null;
};

export type CouncilDecision = {
  bias: string;
  confidence: number;
  agreement: number;
  summary: string;
  providers_requested: string[];
  providers_responded: string[];
  votes: Record<string, number>;
  dissent: string[];
  results: CouncilProviderResult[];
};

export type AssetAnalysis = {
  asset: MarketAsset;
  bias: string;
  confidence: number;
  risk: RiskAssessment;
  summary: string;
  engine: string;
  council?: CouncilDecision | null;
};

export type CouncilStatus = {
  enabled: boolean;
  supported: number;
  configured: number;
  mode: string;
  providers: CouncilProvider[];
};

export type RadarSignal = {
  asset_id: string;
  symbol: string;
  name: string;
  signal: string;
  severity: string;
  change_24h: number;
  risk_score: number;
};

export type NewsItem = {
  title: string;
  link: string;
  source: string;
  published_at: string;
  summary: string;
};

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function getMarket(): Promise<{ assets: MarketAsset[]; source: string }> {
  try {
    const response = await fetch(`${API}/api/market?limit=20`, { cache: "no-store" });
    if (!response.ok) return { assets: [], source: "unavailable" };
    const json = await response.json();
    return { assets: json.data ?? [], source: json.source ?? "unknown" };
  } catch {
    return { assets: [], source: "unavailable" };
  }
}

export async function getRadar(): Promise<RadarSignal[]> {
  try {
    const response = await fetch(`${API}/api/radar?limit=30`, { cache: "no-store" });
    if (!response.ok) return [];
    const json = await response.json();
    return json.data ?? [];
  } catch {
    return [];
  }
}

export async function getAssetAnalysis(coinId: string): Promise<AssetAnalysis | null> {
  try {
    const response = await fetch(`${API}/api/assets/${encodeURIComponent(coinId)}/analysis`, { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export const OPTIONAL_COUNCIL_PROVIDERS: CouncilProvider[] = [
  { provider: "openai", label: "OpenAI", model: "gpt-4o-mini", configured: false, optional: true },
  { provider: "xai", label: "xAI Grok", model: "grok-4.6", configured: false, optional: true },
  { provider: "gemini", label: "Google Gemini", model: "gemini-2.0-flash", configured: false, optional: true },
  { provider: "anthropic", label: "Anthropic Claude", model: "claude-sonnet-4-5", configured: false, optional: true },
  { provider: "mistral", label: "Mistral", model: "mistral-large-latest", configured: false, optional: true },
  { provider: "deepseek", label: "DeepSeek", model: "deepseek-chat", configured: false, optional: true },
  { provider: "groq", label: "Groq", model: "openai/gpt-oss-120b", configured: false, optional: true },
  { provider: "perplexity", label: "Perplexity", model: "sonar", configured: false, optional: true },
  { provider: "openrouter", label: "OpenRouter", model: "", configured: false, optional: true },
];

export async function getCouncilStatus(): Promise<CouncilStatus> {
  try {
    const response = await fetch(`${API}/api/ai/council/status`, { cache: "no-store" });
    if (!response.ok) {
      return { enabled: true, supported: OPTIONAL_COUNCIL_PROVIDERS.length, configured: 0, mode: "unavailable", providers: OPTIONAL_COUNCIL_PROVIDERS };
    }
    const json = await response.json();
    return {
      enabled: Boolean(json.enabled),
      supported: json.supported ?? json.providers?.length ?? OPTIONAL_COUNCIL_PROVIDERS.length,
      configured: json.configured ?? 0,
      mode: json.mode ?? "parallel_weighted_consensus",
      providers: Array.isArray(json.providers) && json.providers.length ? json.providers : OPTIONAL_COUNCIL_PROVIDERS,
    };
  } catch {
    return { enabled: true, supported: OPTIONAL_COUNCIL_PROVIDERS.length, configured: 0, mode: "unavailable", providers: OPTIONAL_COUNCIL_PROVIDERS };
  }
}

export async function getNews(): Promise<{ items: NewsItem[]; message: string | null; configured: boolean }> {
  try {
    const response = await fetch(`${API}/api/news?limit=30`, { cache: "no-store" });
    if (!response.ok) return { items: [], message: "News feed is unavailable.", configured: false };
    const json = await response.json();
    return {
      items: json.data ?? [],
      message: json.message ?? null,
      configured: Boolean(json.configured),
    };
  } catch {
    return { items: [], message: "News feed is unavailable.", configured: false };
  }
}

export async function getCandles(coinId: string, days = 90): Promise<{ data: Candle[]; source: string }> {
  try {
    const response = await fetch(`${API}/api/assets/${encodeURIComponent(coinId)}/candles?days=${days}`, { cache: "no-store" });
    if (!response.ok) return { data: [], source: "unavailable" };
    const json = await response.json();
    return { data: json.data ?? [], source: json.source ?? "unknown" };
  } catch {
    return { data: [], source: "unavailable" };
  }
}
