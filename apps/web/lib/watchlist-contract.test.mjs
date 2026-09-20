import assert from "node:assert/strict";
import test from "node:test";

const LIMIT = 40;

function parseWatchlist(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed) ? parsed : parsed.items;
    if (!Array.isArray(rows)) return [];
    const seen = new Set();
    const items = [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const id = String(row.id || "").trim().toLowerCase();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      items.push({
        id,
        symbol: String(row.symbol || id).slice(0, 16),
        name: String(row.name || id).slice(0, 80),
        addedAt: String(row.addedAt || ""),
      });
      if (items.length >= LIMIT) break;
    }
    return items;
  } catch {
    return [];
  }
}

test("empty and junk payloads stay empty", () => {
  assert.deepEqual(parseWatchlist(null), []);
  assert.deepEqual(parseWatchlist(""), []);
  assert.deepEqual(parseWatchlist("not-json"), []);
  assert.deepEqual(parseWatchlist("{}"), []);
});

test("accepts envelope or bare array and dedupes ids", () => {
  const raw = JSON.stringify({
    items: [
      { id: "Bitcoin", symbol: "btc", name: "Bitcoin", addedAt: "2026-09-20T00:00:00Z" },
      { id: "bitcoin", symbol: "BTC", name: "Bitcoin" },
      { id: " ethereum ", symbol: "eth", name: "Ethereum" },
    ],
  });
  const items = parseWatchlist(raw);
  assert.equal(items.length, 2);
  assert.equal(items[0].id, "bitcoin");
  assert.equal(items[1].id, "ethereum");
});

test("caps the list so a huge localStorage blob cannot stampede the UI", () => {
  const items = Array.from({ length: 80 }, (_, index) => ({ id: `coin-${index}`, symbol: "x", name: "Coin" }));
  assert.equal(parseWatchlist(JSON.stringify({ items })).length, 40);
});
