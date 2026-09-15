export type MarketAsset = {
  id: string;
  symbol: string;
  name: string;
  image?: string | null;
  current_price?: number | null;
  market_cap?: number | null;
  market_cap_rank?: number | null;
  total_volume?: number | null;
  price_change_percentage_24h?: number | null;
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

const API = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function getMarket(): Promise<MarketAsset[]> {
  try {
    const response = await fetch(`${API}/api/market?limit=20`, { cache: "no-store" });
    if (!response.ok) return [];
    const json = await response.json();
    return json.data ?? [];
  } catch {
    return [];
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
