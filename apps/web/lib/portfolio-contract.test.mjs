import assert from "node:assert/strict";
import test from "node:test";

const LIMIT = 40;

function parseHoldings(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed) ? parsed : parsed.items;
    if (!Array.isArray(rows)) return [];
    const seen = new Set();
    const items = [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const coinId = String(row.coinId || "").trim().toLowerCase();
      const qty = Number(row.qty);
      if (!coinId || !Number.isFinite(qty) || qty <= 0) continue;
      const id = String(row.id || `${coinId}-${qty}`);
      if (seen.has(id)) continue;
      seen.add(id);
      const costUsd = row.costUsd == null ? null : Number(row.costUsd);
      items.push({
        id,
        coinId,
        qty,
        costUsd: costUsd != null && Number.isFinite(costUsd) ? costUsd : null,
      });
      if (items.length >= LIMIT) break;
    }
    return items;
  } catch {
    return [];
  }
}

function lotPnl(qty, price, costUsd) {
  if (!Number.isFinite(qty) || price == null || !Number.isFinite(price)) {
    return { value: null, pnl: null };
  }
  const value = qty * price;
  if (costUsd == null || !Number.isFinite(costUsd)) return { value, pnl: null };
  return { value, pnl: value - costUsd };
}

test("junk holdings stay empty and reject zero qty", () => {
  assert.deepEqual(parseHoldings(null), []);
  assert.deepEqual(parseHoldings("nope"), []);
  assert.deepEqual(parseHoldings(JSON.stringify({ items: [{ coinId: "bitcoin", qty: 0 }] })), []);
});

test("accepts multiple lots of the same coin and optional cost", () => {
  const raw = JSON.stringify({
    items: [
      { id: "a", coinId: "Bitcoin", qty: 0.5, costUsd: 40000 },
      { id: "a", coinId: "bitcoin", qty: 0.5, costUsd: 40000 },
      { id: "b", coinId: "bitcoin", qty: 0.1 },
    ],
  });
  const items = parseHoldings(raw);
  assert.equal(items.length, 2);
  assert.equal(items[0].coinId, "bitcoin");
  assert.equal(items[0].costUsd, 40000);
  assert.equal(items[1].costUsd, null);
});

test("P&L uses snapshot quotes only — never invents a price", () => {
  assert.deepEqual(lotPnl(2, 100, 150), { value: 200, pnl: 50 });
  assert.deepEqual(lotPnl(1, null, 10), { value: null, pnl: null });
  assert.deepEqual(lotPnl(1, 90, null), { value: 90, pnl: null });
});

test("aggregate P&L only uses lots that have both a quote and a cost", () => {
  function aggregate(rows, quotes) {
    let quotedValue = 0;
    let valued = 0;
    let comparableValue = 0;
    let comparableCost = 0;
    let comparable = 0;
    for (const row of rows) {
      const stats = lotPnl(row.qty, quotes.get(row.coinId), row.costUsd);
      if (stats.value != null) {
        quotedValue += stats.value;
        valued += 1;
      }
      if (stats.value != null && row.costUsd != null) {
        comparableValue += stats.value;
        comparableCost += row.costUsd;
        comparable += 1;
      }
    }
    return {
      value: valued ? quotedValue : null,
      costUsd: comparable ? comparableCost : null,
      pnl: comparable ? comparableValue - comparableCost : null,
      comparable,
    };
  }
  const quotes = new Map([["bitcoin", 100], ["ethereum", 20]]);
  const mixed = aggregate(
    [
      { coinId: "bitcoin", qty: 1, costUsd: 80 },
      { coinId: "ethereum", qty: 1, costUsd: null },
    ],
    quotes,
  );
  assert.equal(mixed.value, 120);
  assert.equal(mixed.pnl, 20);
  assert.equal(mixed.comparable, 1);
  const missingQuote = aggregate(
    [{ coinId: "solana", qty: 2, costUsd: 50 }],
    quotes,
  );
  assert.equal(missingQuote.value, null);
  assert.equal(missingQuote.pnl, null);
});
