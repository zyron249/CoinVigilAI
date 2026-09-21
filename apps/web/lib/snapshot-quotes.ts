import type { MarketAsset } from "./api";
import { getMarket } from "./api";

const MARKET_PAGE_LIMIT = 100;

function ingest(
  byId: Map<string, MarketAsset>,
  assets: MarketAsset[],
) {
  for (const asset of assets) byId.set(asset.id, asset);
}

export async function hydrateQuotes(
  ids: string[],
  seeded: MarketAsset[] = [],
): Promise<{ byId: Map<string, MarketAsset>; source: string; stale?: boolean }> {
  const byId = new Map(seeded.map((asset) => [asset.id, asset]));
  const needed = [...new Set(ids.map((id) => id.trim().toLowerCase()).filter(Boolean))];
  if (!needed.length && !seeded.length) {
    return { byId, source: "unavailable", stale: false };
  }
  const missingBefore = needed.filter((id) => !byId.has(id));
  let source = "unavailable";
  let stale = false;

  if (missingBefore.length || !seeded.length) {
    const page = await getMarket({ limit: MARKET_PAGE_LIMIT, page: 1 });
    source = page.source;
    stale = Boolean(page.stale);
    ingest(byId, page.assets);
    let pageNo = 2;
    while (needed.some((id) => !byId.has(id)) && pageNo <= 4) {
      const more = await getMarket({ limit: MARKET_PAGE_LIMIT, page: pageNo });
      ingest(byId, more.assets);
      if (source === "unavailable" && more.source !== "unavailable") source = more.source;
      if (more.stale) stale = true;
      if (!more.assets.length) break;
      pageNo += 1;
    }
  }

  const still = needed.filter((id) => !byId.has(id));
  await Promise.all(still.map(async (id) => {
    const extra = await getMarket({ limit: 5, page: 1, q: id });
    ingest(byId, extra.assets);
    if (source === "unavailable" && extra.source !== "unavailable") source = extra.source;
    if (extra.stale) stale = true;
  }));

  if (source === "unavailable" && [...byId.values()].some((asset) => asset.current_price != null)) {
    source = "cache";
  }
  return { byId, source, stale };
}
