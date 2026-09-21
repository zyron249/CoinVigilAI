import assert from "node:assert/strict";
import test from "node:test";

const BULLISH = new Set(["surge", "rally", "bull", "bullish", "soar", "soars", "record", "gain", "gains", "jump", "jumps", "highs", "beats", "inflow", "inflows", "recovery", "rebounds"]);
const BEARISH = new Set(["crash", "dump", "bear", "bearish", "plunge", "plunges", "plummet", "loss", "losses", "hack", "lawsuit", "outflow", "outflows", "selloff", "fraud", "ban"]);

function headlinePolarity(title) {
  const tokens = String(title || "").toLowerCase().match(/[a-z0-9]+/g) || [];
  const pos = tokens.filter((token) => BULLISH.has(token)).length;
  const neg = tokens.filter((token) => BEARISH.has(token)).length;
  if (pos > neg) return 1;
  if (neg > pos) return -1;
  return 0;
}

function matchesCoin(title, coin) {
  const text = ` ${String(title || "").toLowerCase()} `;
  if (coin.id && text.includes(coin.id.replace(/-/g, " "))) return true;
  if (coin.name && coin.name.length >= 3 && text.includes(coin.name.toLowerCase())) return true;
  if (coin.symbol && coin.symbol.length >= 3 && new RegExp(`\\b${coin.symbol}\\b`, "i").test(text)) return true;
  return false;
}

function score(coins, headlines) {
  const matched = [];
  for (const item of headlines) {
    const hit = coins.find((coin) => matchesCoin(item.title, coin));
    if (!hit) continue;
    const polarity = headlinePolarity(item.title);
    matched.push({ title: item.title, coin_id: hit.id, polarity });
  }
  if (!matched.length) {
    return { available: false, reason: "sentiment unavailable" };
  }
  const net = matched.reduce((sum, row) => sum + row.polarity, 0);
  return { available: true, net, matched: matched.length, lean: net > 0 ? "bullish" : net < 0 ? "bearish" : "mixed" };
}

test("headline polarity is lexicon-only", () => {
  assert.equal(headlinePolarity("Bitcoin rally hits record highs"), 1);
  assert.equal(headlinePolarity("Exchange hack sparks a crash"), -1);
  assert.equal(headlinePolarity("Committee schedules a hearing"), 0);
});

test("unrelated headlines stay sentiment unavailable — never invent a social score", () => {
  const out = score(
    [{ id: "bitcoin", symbol: "btc", name: "bitcoin" }],
    [{ title: "Sports league signs a new coach" }],
  );
  assert.equal(out.available, false);
  assert.match(out.reason, /sentiment unavailable/);
});

test("watchlist-related RSS titles can lean without pretending to be NLP", () => {
  const out = score(
    [{ id: "bitcoin", symbol: "btc", name: "bitcoin" }],
    [{ title: "Bitcoin rally continues after ETF inflows" }],
  );
  assert.equal(out.available, true);
  assert.equal(out.lean, "bullish");
});
