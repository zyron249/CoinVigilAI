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
