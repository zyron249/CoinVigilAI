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
  const raw = String(title || "");
  const text = ` ${raw.toLowerCase()} `;
  const generic = new Set(["flow", "near", "one", "ocean", "gas", "ton", "dash"]);
  const ident = String(coin.id || "").replace(/-/g, " ");
  const name = String(coin.name || "").toLowerCase();
  const symbol = String(coin.symbol || "").toLowerCase();
  const isGeneric = generic.has(ident) || generic.has(name);
  if (symbol && symbol.length >= 3) {
    if (isGeneric) {
      if (new RegExp(`\\b${symbol.toUpperCase()}\\b`).test(raw) || new RegExp(`\\$${symbol}\\b`, "i").test(text)) return true;
    } else if (new RegExp(`\\b${symbol}\\b`, "i").test(text)) {
      return true;
    }
  }
  if (isGeneric) return false;
  const bounded = (needle) => {
    if (!needle || needle.length < 3) return false;
    const pattern = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\-/g, "[\\s\\-]+").replace(/\\ /g, "[\\s\\-]+");
    return new RegExp(`(?<![a-z0-9])${pattern}(?![a-z0-9])`).test(text);
  };
  return bounded(ident) || bounded(name);
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

test("generic coin names do not score unrelated English headlines", () => {
  const out = score(
    [{ id: "flow", symbol: "flow", name: "flow" }],
    [{ title: "Cash flow surges after tax refunds" }],
  );
  assert.equal(out.available, false);
});
