import type { MarketAsset } from "./api";
import { getMarket } from "./api";

const MARKET_PAGE_LIMIT = 100;

function ingest(
  byId: Map<string, MarketAsset>,
  assets: MarketAsset[],
) {
  for (const asset of assets) byId.set(asset.id, asset);
}

export type QuoteSnapshot = {
  byId: Map<string, MarketAsset>;
  source: string;
  stale?: boolean;
  asOf?: string | null;
  lastLiveAt?: string | null;
  checkedAt: string;
  error?: string | null;
};

export async function hydrateQuotes(
  ids: string[],
  seeded: MarketAsset[] = [],
): Promise<QuoteSnapshot> {
  const byId = new Map(seeded.map((asset) => [asset.id, asset]));
  const needed = [...new Set(ids.map((id) => id.trim().toLowerCase()).filter(Boolean))];
  const checkedAt = new Date().toISOString();
  if (!needed.length && !seeded.length) {
    return { byId, source: "unavailable", stale: false, asOf: null, lastLiveAt: null, checkedAt, error: null };
  }

  let source = "unavailable";
  let stale = false;
  let asOf: string | null = null;
  let lastLiveAt: string | null = null;
  let error: string | null = null;

  function take(page: { assets: MarketAsset[]; source: string; stale?: boolean; as_of?: string | null; last_live_at?: string | null; error?: string | null }) {
    ingest(byId, page.assets);
    if (page.source && page.source !== "unavailable") source = page.source;
    if (page.stale) stale = true;
    if (page.as_of) asOf = page.as_of;
    if (page.last_live_at) lastLiveAt = page.last_live_at;
    if (page.error) error = page.error;
  }

  if (needed.length) {
    // Always take page 1 so source (coingecko|cache|demo) is honest, even when ids are seeded.
    take(await getMarket({ limit: MARKET_PAGE_LIMIT, page: 1 }));
    let pageNo = 2;
    while (needed.some((id) => !byId.has(id)) && pageNo <= 4) {
      const more = await getMarket({ limit: MARKET_PAGE_LIMIT, page: pageNo });
      take(more);
      if (!more.assets.length) break;
      pageNo += 1;
    }
    const still = needed.filter((id) => !byId.has(id));
    for (const id of still) {
      take(await getMarket({ limit: 5, page: 1, q: id }));
    }
  }

  return { byId, source, stale, asOf, lastLiveAt, checkedAt, error };
}
