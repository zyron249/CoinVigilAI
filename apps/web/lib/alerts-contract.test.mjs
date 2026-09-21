import assert from "node:assert/strict";
import test from "node:test";

function parseAlerts(raw) {
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
      const kind = String(row.kind || "").trim();
      const threshold = Number(row.threshold);
      if (!coinId || !["above", "below", "change_24h"].includes(kind) || !Number.isFinite(threshold)) continue;
      const id = String(row.id || `${coinId}-${kind}-${threshold}`);
      if (seen.has(id)) continue;
      seen.add(id);
      const volumeMultiplier = row.volumeMultiplier == null ? null : Number(row.volumeMultiplier);
      items.push({
        id,
        coinId,
        kind,
        threshold,
        volumeMultiplier: volumeMultiplier != null && Number.isFinite(volumeMultiplier) && volumeMultiplier > 0 ? volumeMultiplier : null,
      });
      if (items.length >= 20) break;
    }
    return items;
  } catch {
    return [];
  }
}

function alertFired(alert, price, change24h) {
  if (alert.kind === "above") return price != null && price >= alert.threshold;
  if (alert.kind === "below") return price != null && price <= alert.threshold;
  if (alert.kind === "change_24h") return change24h != null && Math.abs(change24h) >= alert.threshold;
  return false;
}

function volumePrefilterPass(multiplier, volume, lastVolume) {
  if (multiplier == null || multiplier <= 0) return true;
  if (lastVolume == null || lastVolume <= 0) return true;
  if (volume == null || !Number.isFinite(volume)) return true;
  return volume >= lastVolume * multiplier;
}

function evaluateAlert(alert, quote, opts) {
  if (!opts.watched) return { matching: false, fired: false, status: "off-watchlist" };
  if (alert.muted) return { matching: false, fired: false, status: "muted" };
  if (!volumePrefilterPass(alert.volumeMultiplier, quote.volume, opts.lastVolume)) {
    return { matching: false, fired: false, status: "volume-prefilter" };
  }
  const matching = alertFired(alert, quote.price, quote.change24h);
  if (!matching) return { matching: false, fired: false, status: "watching" };
  if (opts.cooldown) return { matching: true, fired: false, status: "cooldown" };
  return { matching: true, fired: true, status: "fired" };
}

test("junk alert payloads stay empty", () => {
  assert.deepEqual(parseAlerts(null), []);
  assert.deepEqual(parseAlerts("nope"), []);
  assert.deepEqual(parseAlerts(JSON.stringify({ items: [{ coinId: "btc", kind: "moon", threshold: 1 }] })), []);
});

test("accepts above/below/change rules and dedupes ids", () => {
  const raw = JSON.stringify({
    items: [
      { id: "a", coinId: "Bitcoin", kind: "above", threshold: 90000 },
      { id: "a", coinId: "bitcoin", kind: "above", threshold: 90000 },
      { id: "b", coinId: "ethereum", kind: "change_24h", threshold: 5 },
    ],
  });
  const items = parseAlerts(raw);
  assert.equal(items.length, 2);
  assert.equal(items[0].coinId, "bitcoin");
});

test("price rules fire from the snapshot only — no push backend", () => {
  assert.equal(alertFired({ kind: "above", threshold: 100 }, 101, 0), true);
  assert.equal(alertFired({ kind: "below", threshold: 100 }, 99, 0), true);
  assert.equal(alertFired({ kind: "change_24h", threshold: 5 }, 1, -6), true);
  assert.equal(alertFired({ kind: "above", threshold: 100 }, 99, 0), false);
});

test("non-watchlist coins never alert even if the price rule matches", () => {
  const alert = { kind: "above", threshold: 1, volumeMultiplier: null };
  const evald = evaluateAlert(alert, { price: 85000, change24h: 5, volume: 1e9 }, { watched: false, lastVolume: 1e9 });
  assert.equal(evald.fired, false);
  assert.equal(evald.status, "off-watchlist");
});

test("watchlist price rule fires when volume prefilter is off", () => {
  const alert = { kind: "above", threshold: 1, volumeMultiplier: null };
  const evald = evaluateAlert(alert, { price: 85000, change24h: 5, volume: 1e9 }, { watched: true, lastVolume: 1e9 });
  assert.equal(evald.fired, true);
  assert.equal(evald.status, "fired");
});

test("watchlist coin can fire; volume prefilter blocks a quiet print", () => {
  const alert = { kind: "above", threshold: 1, volumeMultiplier: 2 };
  const quiet = evaluateAlert(alert, { price: 85000, change24h: 5, volume: 1e9 }, { watched: true, lastVolume: 1e9 });
  assert.equal(quiet.status, "volume-prefilter");
  assert.equal(quiet.fired, false);
  const loud = evaluateAlert(alert, { price: 85000, change24h: 5, volume: 3e9 }, { watched: true, lastVolume: 1e9 });
  assert.equal(loud.fired, true);
  assert.equal(loud.status, "fired");
});

function alertStatusLabel(status) {
  if (status === "fired") return "Triggered";
  if (status === "cooldown") return "Cooldown";
  if (status === "muted") return "Muted";
  if (status === "off-watchlist") return "Skipped";
  if (status === "volume-prefilter") return "Held";
  return "Watching";
}

test("matching cooldown shows Cooldown, not Watching or a fake push", () => {
  assert.equal(alertStatusLabel("fired"), "Triggered");
  assert.equal(alertStatusLabel("cooldown"), "Cooldown");
  assert.equal(alertStatusLabel("muted"), "Muted");
  assert.equal(alertStatusLabel("watching"), "Watching");
});

test("muted and cooldown rules do not re-notify", () => {
  const alert = { kind: "above", threshold: 1, volumeMultiplier: null, muted: true };
  const muted = evaluateAlert(alert, { price: 85000, change24h: 5, volume: 1e9 }, { watched: true, lastVolume: 1e9 });
  assert.equal(muted.status, "muted");
  assert.equal(muted.fired, false);
  const cool = evaluateAlert(
    { kind: "above", threshold: 1, volumeMultiplier: null },
    { price: 85000, change24h: 5, volume: 1e9 },
    { watched: true, lastVolume: 1e9, cooldown: true },
  );
  assert.equal(cool.status, "cooldown");
  assert.equal(cool.matching, true);
  assert.equal(cool.fired, false);
});
