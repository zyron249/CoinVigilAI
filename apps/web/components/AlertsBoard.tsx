"use client";

import { useEffect, useMemo, useState } from "react";
import type { MarketAsset, WatchlistSentiment } from "../lib/api";
import { getWatchlistSentiment } from "../lib/api";
import {
  ALERTS_LIMIT,
  DEFAULT_COOLDOWN_MINUTES,
  evaluateAlert,
  rememberVolume,
  readVolumeSeen,
  rowStatusLabel,
  SENSITIVITY,
  useAlerts,
  type AlertAnalysis,
  type AlertKind,
  type AlertSensitivity,
  type PriceAlert,
} from "../lib/alerts";
import { useAlertFires } from "../lib/alert-dispatch";
import { hydrateQuotes } from "../lib/snapshot-quotes";
import { useWatchlist } from "../lib/watchlist";
import { formatAge, formatPercent, formatUsd, sourceLabel } from "../lib/format";
import { AlertHistory } from "./AlertHistory";
import Link from "next/link";

function ruleLabel(item: PriceAlert) {
  const vol = item.volumeMultiplier ? ` · vol ≥ ${item.volumeMultiplier}× last seen` : "";
  if (item.kind === "change_24h") return `|24h| ≥ ${item.threshold}%${vol}`;
  return `${item.kind} ${formatUsd(item.threshold)}${vol}`;
}

export function AlertsBoard({
  initialCoin = "",
  initialKind = "above",
}: {
  initialCoin?: string;
  initialKind?: AlertKind;
}) {
  const { items, add, patch, remove } = useAlerts();
  const { items: watched, ids: watchIds } = useWatchlist();
  const [assets, setAssets] = useState<MarketAsset[]>([]);
  const [source, setSource] = useState("unavailable");
  const [stale, setStale] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [coinId, setCoinId] = useState(initialCoin);
  const [kind, setKind] = useState<AlertKind>(["above", "below", "change_24h"].includes(initialKind) ? initialKind : "above");
  const [sensitivity, setSensitivity] = useState<AlertSensitivity>("normal");
  const [analysis, setAnalysis] = useState<AlertAnalysis>("technical");
  const [volumeOn, setVolumeOn] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cooldownMinutes, setCooldownMinutes] = useState(DEFAULT_COOLDOWN_MINUTES);
  const [threshold, setThreshold] = useState(initialKind === "change_24h" ? String(SENSITIVITY.normal.changePct) : "100000");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [lastVolume, setLastVolume] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => Date.now());
  const [sentiment, setSentiment] = useState<WatchlistSentiment | null>(null);

  useEffect(() => {
    if (!coinId && watched[0]) setCoinId(watched[0].id);
    if (coinId && watched.length && !watchIds.has(coinId) && watched[0]) setCoinId(watched[0].id);
  }, [watched, watchIds, coinId]);

  useEffect(() => {
    setLastVolume(readVolumeSeen());
  }, []);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    const ids = watched.map((row) => row.id);
    if (!ids.length) {
      setSentiment(null);
      return;
    }
    let cancelled = false;
    getWatchlistSentiment(ids).then((payload) => {
      if (!cancelled) setSentiment(payload);
    });
    return () => {
      cancelled = true;
    };
  }, [watched]);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const delayRef = { current: 10_000 };
    async function refresh() {
      if (timer) window.clearTimeout(timer);
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        timer = window.setTimeout(refresh, 30_000);
        return;
      }
      const ids = items.map((item) => item.coinId);
      const snap = await hydrateQuotes(ids);
      if (!active) return;
      setAssets([...snap.byId.values()]);
      setSource(snap.source);
      setStale(Boolean(snap.stale));
      setCheckedAt(snap.checkedAt);
      const seen = { ...readVolumeSeen() };
      for (const asset of snap.byId.values()) {
        if (asset.total_volume != null) rememberVolume(asset.id, asset.total_volume);
      }
      setLastVolume(seen);
      const failed = snap.source === "unavailable" || Boolean(snap.error);
      delayRef.current = failed ? Math.min(60_000, Math.max(20_000, delayRef.current * 2)) : 10_000;
      timer = window.setTimeout(refresh, delayRef.current);
    }
    void refresh();
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [items]);

  const byId = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const tone = sourceLabel(source, { stale });

  function evalRow(item: PriceAlert) {
    const live = byId.get(item.coinId);
    return evaluateAlert(
      item,
      { price: live?.current_price, change24h: live?.price_change_percentage_24h, volume: live?.total_volume },
      { watched: watchIds.has(item.coinId), lastVolume: lastVolume[item.coinId], now, source },
    );
  }

  const matching = items.filter((item) => evalRow(item).matching);
  useAlertFires(items, byId, { watchIds, lastVolume, source, now });

  function applySensitivity(next: AlertSensitivity) {
    setSensitivity(next);
    if (kind === "change_24h") setThreshold(String(SENSITIVITY[next].changePct));
  }

  function saveAlert() {
    const id = coinId.trim().toLowerCase();
    const value = Number(threshold);
    if (!id || !watchIds.has(id) || !Number.isFinite(value)) return;
    const live = byId.get(id) || watched.find((row) => row.id === id);
    const payload = {
      coinId: id,
      symbol: live && "symbol" in live ? live.symbol : id,
      name: live && "name" in live ? live.name : id,
      kind,
      threshold: value,
      sensitivity,
      analysis,
      volumeMultiplier: volumeOn ? SENSITIVITY[sensitivity].volumeMult : null,
      muted,
      cooldownMinutes,
    };
    if (editingId) {
      patch(editingId, payload);
      setEditingId(null);
      return;
    }
    add(payload);
  }

  return (
    <>
    <section className="card alerts-card">
      <div className="section-heading">
        <div>
          <div className="eyebrow">WATCHLIST ALERTS</div>
          <h2>Active rules — create, list, mute</h2>
        </div>
        <span className="muted">
          {items.length} / {ALERTS_LIMIT}
          {items.length ? ` · ${tone.text} · poll ${formatAge(checkedAt, now)}` : " · star a coin first"}
        </span>
      </div>
      <p className="muted alerts-note">
        Create a watchlist rule, then read active status and fire history below. Only starred coins are evaluated.
        Quotes poll the CoinGecko snapshot (no WebSocket tick stream). Price/volume rules run before any AI cost.
        Delivery is in-app in this browser, plus an optional HTTPS webhook when ALERT_WEBHOOK_URL is set.
        Telegram and Discord are not implemented. No on-chain whale feed.
      </p>
      {watched.length ? (
        <p className="muted alerts-note" data-sentiment-peek>
          {sentiment == null
            ? "Headline sentiment: checking watchlist-related RSS — never a social score."
            : sentiment.available
              ? `Headline sentiment (${sentiment.engine}, ${sentiment.lean || "mixed"}): ${sentiment.matched ?? sentiment.items.length} watchlist-related RSS title${(sentiment.matched ?? sentiment.items.length) === 1 ? "" : "s"}. Not Twitter, not NLP, not a social score.`
              : sentiment.reason || "sentiment unavailable. CoinVigil does not invent social scores."}
        </p>
      ) : null}
      {matching.length ? (
        <p className="alerts-fired-banner" role="status">
          {matching.length} watchlist rule{matching.length === 1 ? "" : "s"} matching this snapshot (in-tab + local history — no fake push).
        </p>
      ) : null}
      {items.length === 0 ? (
        watched.length ? (
          <div className="empty empty-panel">
            <strong>No watchlist rules yet</strong>
            <p>Use the form below: pick a starred coin, choose price above/below or |24h| %, then save. Fires land in history with timestamps.</p>
          </div>
        ) : null
      ) : (
        <ul className="alerts-list">
          {items.map((item) => {
            const live = byId.get(item.coinId);
            const result = evalRow(item);
            return (
              <li
                key={item.id}
                className={result.matching ? "is-fired" : undefined}
                data-alert-coin={item.coinId}
                data-alert-status={result.status}
              >
                <div className="alert-copy">
                  <strong>
                    <Link href={`/asset/${item.coinId}`}>{live?.name || item.name}</Link>
                    {" "}
                    <span className="muted">{item.sensitivity} · {item.analysis} · {item.cooldownMinutes}m cooldown</span>
                  </strong>
                  <span className="muted">{ruleLabel(item)}</span>
                  <span className="muted">
                    {result.status === "off-watchlist"
                      ? "Off watchlist — not evaluated (never spam the whole market)"
                      : result.status === "volume-prefilter"
                        ? "Volume prefilter held this back vs last-seen 24h volume"
                        : result.status === "muted"
                          ? "Muted — this rule will not fire or write history"
                          : live
                            ? `${formatUsd(live.current_price)} · ${formatPercent(live.price_change_percentage_24h)}`
                            : "Not in this snapshot yet"}
                  </span>
                  {result.matching && item.note ? (
                    <span className="alert-note">
                      {item.note.generated ? "AI-generated from tools" : "Heuristic tools"} · {item.note.engine}: {item.note.text}
                    </span>
                  ) : result.fired ? (
                    <span className="muted">Loading a tool-grounded note…</span>
                  ) : null}
                </div>
                <div className="alert-actions">
                  <span className={result.matching ? "pill" : "muted"}>{rowStatusLabel(result.status, item, now)}</span>
                  <button
                    type="button"
                    className="ghost tool-button"
                    onClick={() => patch(item.id, { muted: !item.muted })}
                  >
                    {item.muted ? "Unmute" : "Mute"}
                  </button>
                  <button
                    type="button"
                    className="ghost tool-button"
                    onClick={() => {
                      setEditingId(item.id);
                      setCoinId(item.coinId);
                      setKind(item.kind);
                      setThreshold(String(item.threshold));
                      setSensitivity(item.sensitivity);
                      setAnalysis(item.analysis);
                      setVolumeOn(item.volumeMultiplier != null);
                      setMuted(item.muted);
                      setCooldownMinutes(item.cooldownMinutes);
                    }}
                  >
                    Edit
                  </button>
                  <button type="button" className="ghost tool-button" onClick={() => remove(item.id)}>Delete</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {watched.length === 0 ? (
        <div className="empty empty-panel">
          <strong>Star a coin first</strong>
          <p>
            Smart alerts are watchlist-scoped. Open <Link href="/#desk">Watchlist → rules → smart alerts → Ask</Link> and
            star 1–3 coins on the free tier.
          </p>
        </div>
      ) : (
        <form
          id="create-alert"
          className="alerts-form smart-form"
          aria-label="Create watchlist alert"
          onSubmit={(event) => {
            event.preventDefault();
            saveAlert();
          }}
        >
          <p className="form-legend">{editingId ? "Edit this watchlist rule" : "Create watchlist alert"}</p>
          <label>
            Watchlist coin
            <select value={coinId} onChange={(event) => setCoinId(event.target.value)}>
              {watched.map((item) => (
                <option key={item.id} value={item.id}>{item.name} ({item.symbol.toUpperCase()})</option>
              ))}
            </select>
          </label>
          <label>
            Rule
            <select
              value={kind}
              onChange={(event) => {
                const next = event.target.value as AlertKind;
                setKind(next);
                if (next === "change_24h") setThreshold(String(SENSITIVITY[sensitivity].changePct));
              }}
            >
              <option value="above">Price above USD</option>
              <option value="below">Price below USD</option>
              <option value="change_24h">|24h change| at least %</option>
            </select>
          </label>
          <label>
            Threshold
            <input type="number" step="any" value={threshold} onChange={(event) => setThreshold(event.target.value)} />
          </label>
          <label>
            Sensitivity
            <select value={sensitivity} onChange={(event) => applySensitivity(event.target.value as AlertSensitivity)}>
              <option value="micro">Micro ({SENSITIVITY.micro.changePct}% / {SENSITIVITY.micro.volumeMult}× vol)</option>
              <option value="normal">Normal ({SENSITIVITY.normal.changePct}% / {SENSITIVITY.normal.volumeMult}× vol)</option>
              <option value="major">Major ({SENSITIVITY.major.changePct}% / {SENSITIVITY.major.volumeMult}× vol)</option>
            </select>
          </label>
          <label>
            Analysis
            <select value={analysis} onChange={(event) => setAnalysis(event.target.value as AlertAnalysis)}>
              <option value="technical">Technical anomaly</option>
              <option value="sentiment">Headline sentiment</option>
              <option value="all">All (headline sentiment)</option>
            </select>
          </label>
          <label>
            Cooldown
            <select value={String(cooldownMinutes)} onChange={(event) => setCooldownMinutes(Number(event.target.value))}>
              <option value="5">5 minutes</option>
              <option value="15">15 minutes</option>
              <option value="60">60 minutes</option>
            </select>
          </label>
          <label className="checkbox-label">
            Volume prefilter
            <input type="checkbox" checked={volumeOn} onChange={(event) => setVolumeOn(event.target.checked)} />
            <span className="muted">{volumeOn ? `${SENSITIVITY[sensitivity].volumeMult}× last 24h volume seen in this browser` : "Off"}</span>
          </label>
          <label className="checkbox-label">
            Mute
            <input type="checkbox" checked={muted} onChange={(event) => setMuted(event.target.checked)} />
            <span className="muted">{muted ? "Will not fire" : "Off"}</span>
          </label>
          <button type="submit">{editingId ? "Save rule changes" : "Save a watchlist rule"}</button>
        </form>
      )}
    </section>
    <AlertHistory />
    </>
  );
}
