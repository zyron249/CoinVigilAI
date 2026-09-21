import assert from "node:assert/strict";
import test from "node:test";

function parseHistory(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed) ? parsed : parsed.items;
    if (!Array.isArray(rows)) return [];
    return rows.filter((row) => row && row.coinId && row.at).slice(0, 50);
  } catch {
    return [];
  }
}

test("junk history stays empty", () => {
  assert.deepEqual(parseHistory(null), []);
  assert.deepEqual(parseHistory("nope"), []);
  assert.deepEqual(parseHistory("{}"), []);
});

test("keeps fired rows and caps at 50", () => {
  const items = Array.from({ length: 80 }, (_, index) => ({
    id: `h-${index}`,
    coinId: "bitcoin",
    at: "2026-09-21T00:00:00Z",
  }));
  assert.equal(parseHistory(JSON.stringify({ items })).length, 50);
});
