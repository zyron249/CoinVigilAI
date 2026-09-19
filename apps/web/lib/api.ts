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

export type AssetAnalysis = {
  asset: MarketAsset;
  bias: string;
  confidence: number;
  risk: RiskAssessment;
  summary: string;
  engine: string;
  council?: {
    agreement: number;
    providers_requested: string[];
    providers_responded: string[];
    dissent: string[];
    votes?: Record<string, number>;
  } | null;
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
