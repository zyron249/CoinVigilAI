import assert from "node:assert/strict";
import test from "node:test";

function rowRange(page, limit, total) {
  if (total <= 0 || limit <= 0) return { start: 0, end: 0 };
  const safePage = Math.max(1, page);
  const start = (safePage - 1) * limit + 1;
  if (start > total) return { start: 0, end: 0 };
  return { start, end: Math.min(safePage * limit, total) };
}

function pageWindow(page, pageCount, radius = 1) {
  const count = Math.max(1, pageCount);
  const current = Math.min(Math.max(1, page), count);
  const start = Math.max(1, current - radius);
  const end = Math.min(count, current + radius);
  const pages = [];
  if (start > 1) pages.push(1);
  if (start > 2) pages.push("ellipsis");
  for (let index = start; index <= end; index += 1) pages.push(index);
  if (end < count - 1) pages.push("ellipsis");
  if (end < count) pages.push(count);
  return pages;
}

function clampLimit(raw) {
  const value = Number(raw);
  return [20, 50, 100].includes(value) ? value : 50;
}

function parseMarketQuery(input) {
  const sort = String(input.sort || "market_cap").trim().toLowerCase();
  const allowed = new Set(["rank", "name", "price", "change_1h", "change_24h", "change_7d", "market_cap", "volume"]);
  const page = Math.floor(Number(input.page));
  return {
    q: String(input.q || "").trim(),
    page: Number.isFinite(page) && page >= 1 ? page : 1,
    limit: clampLimit(input.limit),
    sort: allowed.has(sort) ? sort : "market_cap",
    order: input.order === "asc" || input.order === "desc" ? input.order : "desc",
  };
}

test("row range names the visible slice of a 1000-asset snapshot", () => {
  assert.deepEqual(rowRange(1, 50, 1000), { start: 1, end: 50 });
  assert.deepEqual(rowRange(20, 50, 1000), { start: 951, end: 1000 });
  assert.deepEqual(rowRange(1, 50, 0), { start: 0, end: 0 });
  assert.deepEqual(rowRange(3, 50, 80), { start: 0, end: 0 });
});

test("page window keeps first/last when the snapshot has many pages", () => {
  assert.deepEqual(pageWindow(1, 5), [1, 2, "ellipsis", 5]);
  assert.deepEqual(pageWindow(10, 20), [1, "ellipsis", 9, 10, 11, "ellipsis", 20]);
  assert.deepEqual(pageWindow(1, 1), [1]);
});

test("market query ignores junk sort/limit/page", () => {
  assert.deepEqual(parseMarketQuery({ q: " usdc ", page: "2", limit: "100", sort: "volume", order: "asc" }), {
    q: "usdc",
    page: 2,
    limit: 100,
    sort: "volume",
    order: "asc",
  });
  assert.equal(parseMarketQuery({ sort: "javascript:alert(1)", limit: "999", page: "-3" }).sort, "market_cap");
  assert.equal(parseMarketQuery({ limit: "999" }).limit, 50);
  assert.equal(parseMarketQuery({ page: "0" }).page, 1);
});

function searchAnnouncement(input) {
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
  const coverage = input.universe ? ` ${input.universe} of ${input.coverageTarget || 1000} CoinGecko-tracked in snapshot.` : "";
  return `${slice}${coverage}`;
}

test("search announcement names match counts without inventing coverage", () => {
  const filtered = searchAnnouncement({ query: "usdc", total: 2, page: 1, limit: 50, universe: 750, coverageTarget: 1000 });
  assert.match(filtered, /2 matches for “usdc”/);
  assert.match(filtered, /rows 1–2/i);
  assert.match(filtered, /not every coin on earth/i);
  const open = searchAnnouncement({ query: "", total: 750, page: 2, limit: 50, universe: 750, coverageTarget: 1000 });
  assert.match(open, /Rows 51–100 of 750/);
  assert.match(open, /page 2 of 15/);
  assert.match(open, /750 of 1000/);
});

function nextChip(index, length, key) {
  if (key === "ArrowRight" || key === "ArrowDown") return (index + 1) % length;
  if (key === "ArrowLeft" || key === "ArrowUp") return (index - 1 + length) % length;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  return index;
}

test("sticky sub-nav keyboard wraps between section chips", () => {
  assert.equal(nextChip(0, 6, "ArrowRight"), 1);
  assert.equal(nextChip(5, 6, "ArrowRight"), 0);
  assert.equal(nextChip(0, 6, "ArrowLeft"), 5);
  assert.equal(nextChip(3, 6, "Home"), 0);
  assert.equal(nextChip(0, 6, "End"), 5);
});
