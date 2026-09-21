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
