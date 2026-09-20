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
  price_change_percentage_1h?: number | null;
  price_change_percentage_7d?: number | null;
  circulating_supply?: number | null;
  total_supply?: number | null;
  max_supply?: number | null;
  fully_diluted_valuation?: number | null;
  ath?: number | null;
  ath_change_percentage?: number | null;
  ath_date?: string | null;
  atl?: number | null;
  atl_change_percentage?: number | null;
  atl_date?: string | null;
  sparkline_7d?: number[];
  last_updated?: string | null;
};

export type Freshness = {
  last_live_at?: string | null;
  as_of?: string | null;
  stale?: boolean;
  fallback_reason?: string | null;
};

export type MarketPage = {
  assets: MarketAsset[];
  source: string;
  page: number;
  limit: number;
  total: number;
  sort: string;
  order: string;
  universe_size: number;
  query?: string | null;
  coverage_note?: string | null;
  partial?: boolean;
  coverage_target?: number;
  error?: string | null;
} & Freshness;

export type GlobalOverview = {
  total_market_cap_usd?: number | null;
  total_volume_24h_usd?: number | null;
  market_cap_change_percentage_24h_usd?: number | null;
  btc_dominance?: number | null;
  eth_dominance?: number | null;
  active_cryptocurrencies?: number | null;
  fear_greed_value?: number | null;
  fear_greed_classification?: string | null;
  fear_greed_source?: string | null;
  source: string;
  coverage: string;
  note?: string | null;
} & Freshness;

export type MarketMovers = {
  gainers: MarketAsset[];
  losers: MarketAsset[];
  count: number;
  source: string;
} & Freshness;

export type MarketBrief = {
  headline: string;
  tone: string;
  summary: string;
  bullets: string[];
  engine: string;
  generated: boolean;
  data_source: string;
  providers_requested: string[];
  providers_responded: string[];
  disclaimer: string;
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
  data_source?: string;
  disclaimer?: string;
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
  published_at: string | null;
  summary: string;
};

export type MarketQuery = {
  limit?: number;
  page?: number;
  sort?: string;
  order?: string;
  q?: string;
};

export type ExchangeTicker = {
  exchange: string;
  exchange_id?: string | null;
  pair: string;
  base: string;
  target: string;
  price_usd?: number | null;
  last_price?: number | null;
  volume_usd?: number | null;
  trust_score?: string | null;
  bid_ask_spread_percentage?: number | null;
  trade_url?: string | null;
  last_traded_at?: string | null;
};

export type AssetTickers = {
  coin_id: string;
  data: ExchangeTicker[];
  count: number;
  page: number;
  limit: number;
  total: number;
  unique_exchange_count?: number;
  venues?: string[];
  query?: string | null;
  min_volume?: number | null;
  sort?: string;
  order?: string;
  source: string;
  note: string;
} & Freshness;

export type AssetCompare = {
  ids: string[];
  data: MarketAsset[];
  missing: string[];
  count: number;
  source: string;
  note: string;
} & Freshness;

export type ProjectLink = {
  kind: string;
  label: string;
  url: string;
};

export type AssetProfile = {
  coin_id: string;
  links: ProjectLink[];
  categories: string[];
  description?: string | null;
  genesis_date?: string | null;
  source: string;
  note: string;
} & Freshness;

const FETCH_MS = 12_000;
const MARKET_SOURCES = new Set(["coingecko", "cache", "demo"]);

function freshnessFrom(json: Partial<Freshness> | null | undefined): Freshness {
  return {
    last_live_at: json?.last_live_at ?? null,
    as_of: json?.as_of ?? null,
    stale: Boolean(json?.stale),
    fallback_reason: json?.fallback_reason ?? null,
  };
}

function apiBase() {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  }
  return process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
}

async function request(path: string): Promise<Response> {
  return fetch(`${apiBase()}${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_MS),
  });
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await request(path);
    if (!response.ok) return fallback;
    return await response.json();
  } catch {
    return fallback;
  }
}

export async function getMarket(query: MarketQuery = {}): Promise<MarketPage> {
  const limit = query.limit ?? 50;
  const page = query.page ?? 1;
  const sort = query.sort ?? "market_cap";
  const order = query.order ?? "desc";
  const q = (query.q ?? "").trim();
  const empty: MarketPage = {
    assets: [],
    source: "unavailable",
    page,
    limit,
    total: 0,
    sort,
    order,
    universe_size: 0,
    query: q || null,
    coverage_note: "CoinGecko-tracked snapshot by market cap — not every coin on every exchange.",
    partial: false,
    coverage_target: 1000,
    error: "Rankings are unavailable.",
    last_live_at: null,
    as_of: null,
    stale: false,
    fallback_reason: "unreachable",
  };
  try {
    const search = new URLSearchParams({
      limit: String(limit),
      page: String(page),
      sort,
      order,
    });
    if (q) search.set("q", q);
    const response = await request(`/api/market?${search}`);
    if (!response.ok) return empty;
    const json = await response.json();
    return {
      assets: json.data ?? [],
      source: MARKET_SOURCES.has(json.source) ? json.source : "unavailable",
      page: json.page ?? page,
      limit: json.limit ?? limit,
      total: json.total ?? (json.data ?? []).length,
      sort: json.sort ?? sort,
      order: json.order ?? order,
      universe_size: json.universe_size ?? json.total ?? 0,
      query: json.query ?? (q || null),
      coverage_note: json.coverage_note ?? empty.coverage_note,
      partial: Boolean(json.partial),
      coverage_target: json.coverage_target ?? 1000,
      error: null,
      ...freshnessFrom(json),
    };
  } catch {
    return empty;
  }
}

export async function getGlobalOverview(): Promise<GlobalOverview> {
  return readJson<GlobalOverview>("/api/market/global", {
    source: "unavailable",
    coverage: "unavailable",
    last_live_at: null,
    as_of: null,
    stale: false,
    fallback_reason: "unreachable",
  });
}

export async function getMovers(limit = 5): Promise<MarketMovers> {
  return readJson<MarketMovers>(`/api/market/movers?limit=${limit}`, {
    gainers: [],
    losers: [],
    count: 0,
    source: "unavailable",
    last_live_at: null,
    as_of: null,
    stale: false,
    fallback_reason: "unreachable",
  });
}

export async function getMarketBrief(): Promise<MarketBrief | null> {
  const json = await readJson<MarketBrief | Record<string, never>>("/api/market/brief", {});
  if (!json || !("headline" in json) || !json.headline) return null;
  return json as MarketBrief;
}

export async function getRadar(): Promise<RadarSignal[]> {
  const json = await readJson<{ data?: RadarSignal[] }>("/api/radar?limit=30", {});
  return json.data ?? [];
}

export async function getAssetTickers(
  coinId: string,
  page = 1,
  limit = 25,
  extras: { q?: string; minVolume?: number; sort?: string; order?: string } = {},
): Promise<AssetTickers> {
  const empty: AssetTickers = {
    coin_id: coinId,
    data: [],
    count: 0,
    page,
    limit,
    total: 0,
    unique_exchange_count: 0,
    venues: [],
    query: extras.q || null,
    min_volume: extras.minVolume ?? null,
    sort: extras.sort || "volume",
    order: extras.order || "desc",
    source: "unavailable",
    note: "Exchange listings are unavailable. CoinVigil does not scrape venues or invent pairs.",
    last_live_at: null,
    as_of: null,
    stale: false,
    fallback_reason: "unreachable",
  };
  try {
    const search = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (extras.q) search.set("q", extras.q);
    if (extras.minVolume && extras.minVolume > 0) search.set("min_volume", String(extras.minVolume));
    if (extras.sort) search.set("sort", extras.sort);
    if (extras.order) search.set("order", extras.order);
    const response = await request(`/api/assets/${encodeURIComponent(coinId)}/tickers?${search}`);
    if (!response.ok) return empty;
    const json = await response.json();
    return {
      coin_id: json.coin_id ?? coinId,
      data: Array.isArray(json.data) ? json.data : [],
      count: json.count ?? 0,
      page: json.page ?? page,
      limit: json.limit ?? limit,
      total: json.total ?? 0,
      unique_exchange_count: json.unique_exchange_count ?? 0,
      venues: Array.isArray(json.venues) ? json.venues : [],
      query: json.query ?? extras.q ?? null,
      min_volume: json.min_volume ?? extras.minVolume ?? null,
      sort: json.sort ?? extras.sort ?? "volume",
      order: json.order ?? extras.order ?? "desc",
      source: MARKET_SOURCES.has(json.source) ? json.source : "unavailable",
      note: json.note ?? empty.note,
      ...freshnessFrom(json),
    };
  } catch {
    return empty;
  }
}

export async function getAssetProfile(coinId: string): Promise<AssetProfile> {
  const empty: AssetProfile = {
    coin_id: coinId,
    links: [],
    categories: [],
    description: null,
    genesis_date: null,
    source: "unavailable",
    note: "Project links are unavailable. CoinVigil does not invent URLs or scrape social networks.",
    last_live_at: null,
    as_of: null,
    stale: false,
    fallback_reason: "unreachable",
  };
  try {
    const response = await request(`/api/assets/${encodeURIComponent(coinId)}/profile`);
    if (!response.ok) return empty;
    const json = await response.json();
    const links = Array.isArray(json.links)
      ? json.links.filter((item: ProjectLink) => {
          const url = typeof item?.url === "string" ? item.url.trim() : "";
          return url.startsWith("http://") || url.startsWith("https://");
        }).map((item: ProjectLink) => ({
          kind: String(item.kind || "link"),
          label: String(item.label || "Link"),
          url: item.url.trim(),
        }))
      : [];
    return {
      coin_id: json.coin_id ?? coinId,
      links,
      categories: Array.isArray(json.categories)
        ? json.categories.map((item: unknown) => String(item || "").trim()).filter(Boolean).slice(0, 8)
        : [],
      description: typeof json.description === "string" ? json.description : null,
      genesis_date: typeof json.genesis_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(json.genesis_date)
        ? json.genesis_date
        : null,
      source: MARKET_SOURCES.has(json.source) ? json.source : "unavailable",
      note: json.note ?? empty.note,
      ...freshnessFrom(json),
    };
  } catch {
    return empty;
  }
}

export async function getCompare(ids: string): Promise<AssetCompare> {
  const empty: AssetCompare = {
    ids: ids.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean).slice(0, 3),
    data: [],
    missing: [],
    count: 0,
    source: "unavailable",
    note: "Compare is unavailable. CoinVigil does not invent assets to fill empty columns.",
    last_live_at: null,
    as_of: null,
    stale: false,
    fallback_reason: "unreachable",
  };
  try {
    const search = new URLSearchParams();
    if (ids.trim()) search.set("ids", ids.trim());
    const response = await request(`/api/compare?${search}`);
    if (!response.ok) return empty;
    const json = await response.json();
    return {
      ids: Array.isArray(json.ids) ? json.ids : empty.ids,
      data: Array.isArray(json.data) ? json.data : [],
      missing: Array.isArray(json.missing) ? json.missing : [],
      count: json.count ?? 0,
      source: MARKET_SOURCES.has(json.source) ? json.source : "unavailable",
      note: json.note ?? empty.note,
      ...freshnessFrom(json),
    };
  } catch {
    return empty;
  }
}

export async function getAssetAnalysis(coinId: string): Promise<AssetAnalysis | null> {
  try {
    const response = await request(`/api/assets/${encodeURIComponent(coinId)}/analysis`);
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
    const response = await request("/api/ai/council/status");
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

export async function getNews(): Promise<{
  items: NewsItem[];
  message: string | null;
  configured: boolean;
  usingDefaults: boolean;
  hosts: string[];
}> {
  try {
    const response = await request("/api/news?limit=30");
    if (!response.ok) {
      return { items: [], message: "News feed is unavailable.", configured: false, usingDefaults: false, hosts: [] };
    }
    const json = await response.json();
    return {
      items: json.data ?? [],
      message: json.message ?? null,
      configured: Boolean(json.configured),
      usingDefaults: Boolean(json.using_defaults),
      hosts: Array.isArray(json.hosts) ? json.hosts : [],
    };
  } catch {
    return { items: [], message: "News feed is unavailable.", configured: false, usingDefaults: false, hosts: [] };
  }
}

export type StackStatus = {
  status: string;
  version?: string;
  disclaimer?: string;
  market?: {
    provider: string;
    label?: string;
    redis: string;
    source?: string | null;
    stale?: boolean;
    last_live_at?: string | null;
    fallback_reason?: string | null;
    observed?: boolean;
    key_configured?: boolean;
  };
  postgres?: string;
  news?: { feeds: number; hosts: string[]; using_defaults: boolean };
  ai?: { enabled: boolean; configured: string[]; configured_count: number; supported: number };
};

export async function getStackStatus(): Promise<StackStatus> {
  return readJson<StackStatus>("/api/status", {
    status: "unavailable",
    postgres: "not_provisioned",
    market: { provider: "unknown", redis: "unavailable", source: null, observed: false },
    news: { feeds: 0, hosts: [], using_defaults: false },
    ai: { enabled: false, configured: [], configured_count: 0, supported: 0 },
    disclaimer: "Informational research only — not financial advice.",
  });
}

export async function getCandles(coinId: string, days = 90): Promise<{ data: Candle[]; source: string }> {
  try {
    const response = await request(`/api/assets/${encodeURIComponent(coinId)}/candles?days=${days}`);
    if (!response.ok) return { data: [], source: "unavailable" };
    const json = await response.json();
    return { data: json.data ?? [], source: json.source ?? "unknown" };
  } catch {
    return { data: [], source: "unavailable" };
  }
}
