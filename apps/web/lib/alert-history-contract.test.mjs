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

test("cooldown updates the existing fire row instead of dropping the note", () => {
  const first = {
    id: "h-1",
    alertId: "btc-above",
    coinId: "bitcoin",
    at: "2026-09-21T13:00:00.000Z",
    note: { text: "pending", engine: "heuristic-tools", generated: false, at: "2026-09-21T13:00:00.000Z" },
    delivered: false,
  };
  const parsed = parseHistory(JSON.stringify({ items: [first] }));
  assert.equal(parsed.length, 1);
  const patched = [{ ...parsed[0], note: { ...parsed[0].note, text: "grounded" }, delivered: false }];
  assert.equal(patched[0].note.text, "grounded");
  assert.equal(patched[0].alertId, "btc-above");
});
