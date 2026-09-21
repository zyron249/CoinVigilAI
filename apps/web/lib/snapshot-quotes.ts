import type { MarketAsset } from "./api";
import { getAssetAnalysis, getMarket } from "./api";

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
    const page = await getMarket({ limit: 250, page: 1 });
    source = page.source;
    stale = Boolean(page.stale);
    for (const asset of page.assets) byId.set(asset.id, asset);
  }
  const still = needed.filter((id) => !byId.has(id)).slice(0, 8);
  await Promise.all(still.map(async (id) => {
    const analysis = await getAssetAnalysis(id);
    if (analysis?.asset) {
      byId.set(analysis.asset.id, analysis.asset);
      if (source === "unavailable" && analysis.data_source) source = analysis.data_source;
    }
  }));
  if (source === "unavailable" && [...byId.values()].some((asset) => asset.current_price != null)) {
    source = "cache";
  }
  return { byId, source, stale };
}
