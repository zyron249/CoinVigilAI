"use client";

import { useEffect, useMemo, useState } from "react";
import type { MarketAsset } from "../lib/api";
import { getAssetInsight, getWatchlistSentiment, postAlertNotify } from "../lib/api";
import {
  ALERTS_LIMIT,
  DEFAULT_COOLDOWN_MINUTES,
  evaluateAlert,
  rememberVolume,
  readVolumeSeen,
  SENSITIVITY,
  useAlerts,
  type AlertAnalysis,
  type AlertKind,
  type AlertSensitivity,
  type PriceAlert,
} from "../lib/alerts";
import { recordFire } from "../lib/alert-history";
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

function statusLabel(status: string) {
  if (status === "fired") return "Triggered";
  if (status === "cooldown") return "Cooldown";
  if (status === "muted") return "Muted";
  if (status === "off-watchlist") return "Skipped";
  if (status === "volume-prefilter") return "Held";
  return "Watching";
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
    let active = true;
    let timer: number | undefined;
    const delayRef = { current: 10_000 };
    async function refresh() {
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
      { watched: watchIds.has(item.coinId), lastVolume: lastVolume[item.coinId], now },
    );
  }

  const matching = items.filter((item) => evalRow(item).matching);
  const notifyIds = items.filter((item) => evalRow(item).fired).map((item) => item.id).join(",");

  useEffect(() => {
    if (!notifyIds) return;
    let cancelled = false;
    async function attachAndRecord() {
      const wantSentiment = items.some((item) => notifyIds.split(",").includes(item.id) && (item.analysis === "sentiment" || item.analysis === "all"));
      const sentiment = wantSentiment
        ? await getWatchlistSentiment(watched.map((row) => row.id))
        : null;
      for (const item of items) {
        if (!notifyIds.split(",").includes(item.id)) continue;
        const insight = await getAssetInsight(item.coinId);
        if (cancelled) return;
        let extra = " No on-chain whale feed on this instance — CoinVigil does not invent whale prints.";
        if (item.analysis === "sentiment" || item.analysis === "all") {
          extra = sentiment?.available
            ? ` Headline sentiment (${sentiment.engine}, ${sentiment.lean}): ${sentiment.items.slice(0, 2).map((row) => row.title).join(" · ") || "matched RSS"}. ${sentiment.note || ""}`
            : ` ${sentiment?.reason || "sentiment unavailable"}.`;
        }
        const note = {
          text: `${insight.answer}${extra}`.slice(0, 800),
          engine: insight.engine || "heuristic-tools",
          generated: Boolean(insight.generated),
          at: new Date().toISOString(),
        };
        const delivery = await postAlertNotify({
          coin_id: item.coinId,
          name: item.name,
          symbol: item.symbol,
          kind: item.kind,
          threshold: item.threshold,
          note: note.text,
          at: note.at,
        });
        if (cancelled) return;
        recordFire(item, byId.get(item.coinId)?.current_price, note, delivery.delivered);
        patch(item.id, { note, lastNotifiedAt: note.at });
      }
    }
    void attachAndRecord();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifyIds]);

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
          <h2>Rule-based prefilter, then a grounded note</h2>
        </div>
        <span className="muted">{items.length} / {ALERTS_LIMIT} · {tone.text} · poll {formatAge(checkedAt, now)}</span>
      </div>
      <p className="muted alerts-note">
        Only coins on your watchlist are evaluated. Quotes poll the CoinGecko snapshot (no WebSocket tick stream).
        Price/volume rules run before any AI cost. History stays in this browser. Telegram bots are not implemented;
        optional HTTPS webhook is env-gated. No on-chain whale feed.
      </p>
      {matching.length ? (
        <p className="alerts-fired-banner" role="status">
          {matching.length} watchlist rule{matching.length === 1 ? "" : "s"} matching this snapshot (in-tab + local history — no fake push).
        </p>
      ) : null}
      {items.length === 0 ? (
        watched.length ? (
          <div className="empty empty-panel">
            <strong>No watchlist rules yet</strong>
            <p>Create a price, 24h-change, or volume-prefiltered rule for a starred coin.</p>
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
                  <span className={result.matching ? "pill" : "muted"}>{statusLabel(result.status)}</span>
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
            Smart alerts are watchlist-scoped. Open <Link href="/#watchlist">Markets → Watchlist</Link> and star up to 3
            coins on the free tier.
          </p>
        </div>
      ) : (
        <form
          className="alerts-form smart-form"
          onSubmit={(event) => {
            event.preventDefault();
            saveAlert();
          }}
        >
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
          <button type="submit">{editingId ? "Save edit" : "Save locally"}</button>
        </form>
      )}
    </section>
    <AlertHistory />
    </>
  );
}
