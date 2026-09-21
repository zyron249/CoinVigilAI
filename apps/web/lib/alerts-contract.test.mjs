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
  if (opts.source === "demo") return { matching: true, fired: false, status: "demo" };
  if (opts.source != null && opts.source !== "coingecko" && opts.source !== "cache") {
    return { matching: true, fired: false, status: "watching" };
  }
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

function cooldownRemainingLabel(row, now) {
  if (!row || !row.lastNotifiedAt) return null;
  const then = new Date(row.lastNotifiedAt).getTime();
  const ms = then + row.cooldownMinutes * 60_000 - now;
  if (ms <= 0) return null;
  const sec = Math.ceil(ms / 1000);
  if (sec < 60) return `${sec}s left`;
  return `${Math.ceil(sec / 60)}m left`;
}

function rowStatusLabel(status, row, now) {
  if (status === "fired") return "Triggered";
  if (status === "cooldown") {
    const left = cooldownRemainingLabel(row, now);
    return left ? `Cooldown · ${left}` : "Cooldown";
  }
  if (status === "muted") return "Muted";
  return "Watching";
}

test("matching cooldown shows remaining time, not Watching or a fake push", () => {
  const at = "2026-09-21T13:00:00.000Z";
  const now = Date.parse("2026-09-21T13:03:00.000Z");
  const row = { lastNotifiedAt: at, cooldownMinutes: 15 };
  assert.equal(rowStatusLabel("cooldown", row, now), "Cooldown · 12m left");
  assert.equal(rowStatusLabel("fired", row, now), "Triggered");
});

test("matching cooldown shows Cooldown, not Watching or a fake push", () => {
  assert.equal(rowStatusLabel("fired"), "Triggered");
  assert.equal(rowStatusLabel("cooldown"), "Cooldown");
  assert.equal(rowStatusLabel("muted"), "Muted");
  assert.equal(rowStatusLabel("watching"), "Watching");
});

test("demo snapshots match visually but never notify", () => {
  const alert = { kind: "above", threshold: 1, volumeMultiplier: null };
  const evald = evaluateAlert(alert, { price: 85000, change24h: 5, volume: 1e9 }, { watched: true, lastVolume: 1e9, source: "demo" });
  assert.equal(evald.matching, true);
  assert.equal(evald.fired, false);
  assert.equal(evald.status, "demo");
});

test("unavailable quotes match visually but never notify", () => {
  const alert = { kind: "above", threshold: 1, volumeMultiplier: null };
  const evald = evaluateAlert(alert, { price: 85000, change24h: 5, volume: 1e9 }, { watched: true, lastVolume: 1e9, source: "unavailable" });
  assert.equal(evald.matching, true);
  assert.equal(evald.fired, false);
  assert.equal(evald.status, "watching");
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

function clipNote(text, max = 420) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (raw.length <= max) return raw;
  const cut = raw.slice(0, max - 1);
  const breakAt = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "), cut.lastIndexOf(" "));
  return `${(breakAt > max * 0.45 ? cut.slice(0, breakAt) : cut).trim()}…`;
}

test("fire notes clip on a word boundary instead of mid-letter", () => {
  const long = `${"word ".repeat(80)}CoinVigil does not invent whale prints.`;
  const clipped = clipNote(long, 80);
  assert.ok(clipped.endsWith("…"));
  assert.ok(!clipped.includes("inven…"));
  assert.ok(clipped.length <= 81);
});
