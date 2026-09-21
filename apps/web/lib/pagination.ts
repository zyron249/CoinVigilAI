export const MARKET_LIMITS = [20, 50, 100] as const;
export const MARKET_SORTS = [
  "rank",
  "name",
  "price",
  "change_1h",
  "change_24h",
  "change_7d",
  "market_cap",
  "volume",
] as const;

export type MarketQueryState = {
  q: string;
  page: number;
  limit: number;
  sort: string;
  order: "asc" | "desc";
};

export function clampLimit(raw: number | string | null | undefined): number {
  const value = Number(raw);
  return MARKET_LIMITS.includes(value as (typeof MARKET_LIMITS)[number]) ? value : 50;
}

export function clampPage(raw: number | string | null | undefined): number {
  const value = Math.floor(Number(raw));
  return Number.isFinite(value) && value >= 1 ? value : 1;
}

export function clampSort(raw: string | null | undefined): string {
  const key = (raw || "market_cap").trim().toLowerCase();
  return (MARKET_SORTS as readonly string[]).includes(key) ? key : "market_cap";
}

export function clampOrder(raw: string | null | undefined): "asc" | "desc" {
  return raw === "asc" || raw === "desc" ? raw : "desc";
}

export function rowRange(page: number, limit: number, total: number): { start: number; end: number } {
  if (total <= 0 || limit <= 0) return { start: 0, end: 0 };
  const safePage = Math.max(1, page);
  const start = (safePage - 1) * limit + 1;
  if (start > total) return { start: 0, end: 0 };
  return { start, end: Math.min(safePage * limit, total) };
}

export function pageWindow(page: number, pageCount: number, radius = 1): Array<number | "ellipsis"> {
  const count = Math.max(1, pageCount);
  const current = Math.min(Math.max(1, page), count);
  const start = Math.max(1, current - radius);
  const end = Math.min(count, current + radius);
  const pages: Array<number | "ellipsis"> = [];
  if (start > 1) pages.push(1);
  if (start > 2) pages.push("ellipsis");
  for (let index = start; index <= end; index += 1) pages.push(index);
  if (end < count - 1) pages.push("ellipsis");
  if (end < count) pages.push(count);
  return pages;
}

export function parseMarketQuery(input: {
  q?: string | null;
  page?: string | number | null;
  limit?: string | number | null;
  sort?: string | null;
  order?: string | null;
}): MarketQueryState {
  return {
    q: String(input.q || "").trim(),
    page: clampPage(input.page),
    limit: clampLimit(input.limit),
    sort: clampSort(input.sort),
    order: clampOrder(input.order),
  };
}

export function writeMarketQuery(next: MarketQueryState): void {
  if (typeof window === "undefined") return;
  if (window.location.pathname !== "/") return;
  const url = new URL(window.location.href);
  const q = next.q.trim();
  if (q) url.searchParams.set("q", q);
  else url.searchParams.delete("q");
  if (next.page > 1) url.searchParams.set("page", String(next.page));
  else url.searchParams.delete("page");
  if (next.limit !== 50) url.searchParams.set("limit", String(next.limit));
  else url.searchParams.delete("limit");
  if (next.sort !== "market_cap") url.searchParams.set("sort", next.sort);
  else url.searchParams.delete("sort");
  const defaultOrder = next.sort === "name" || next.sort === "rank" ? "asc" : "desc";
  if (next.order !== defaultOrder) url.searchParams.set("order", next.order);
  else url.searchParams.delete("order");
  const nextSearch = url.searchParams.toString();
  const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}${url.hash}`;
  window.history.replaceState(null, "", nextUrl);
}

export function searchAnnouncement(input: {
  query?: string | null;
  total: number;
  page: number;
  limit: number;
  universe?: number | null;
  coverageTarget?: number | null;
}): string {
  const q = String(input.query || "").trim();
  const range = rowRange(input.page, input.limit, input.total);
  const pageCount = Math.max(1, Math.ceil((input.total || 0) / Math.max(input.limit, 1)));
  if (q) {
    const matches = input.total === 1 ? "1 match" : `${input.total} matches`;
    const slice = range.start ? ` Showing rows ${range.start}–${range.end}.` : " No matching rows on this page.";
    return `${matches} for “${q}” in this CoinGecko snapshot.${slice} Not every coin on earth.`;
  }
  const slice = range.start
    ? `Rows ${range.start}–${range.end} of ${input.total}, page ${input.page} of ${pageCount}.`
    : `No rows on page ${input.page} of ${pageCount}.`;
  const coverage = input.universe
    ? ` ${input.universe} of ${input.coverageTarget || 1000} CoinGecko-tracked in snapshot.`
    : "";
  return `${slice}${coverage}`;
}
