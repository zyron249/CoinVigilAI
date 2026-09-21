"use client";

import { useEffect, useMemo, useState } from "react";
import type { MarketAsset } from "../lib/api";
import { getAssetInsight } from "../lib/api";
import {
  ALERTS_LIMIT,
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
import { hydrateQuotes } from "../lib/snapshot-quotes";
import { useWatchlist } from "../lib/watchlist";
import { formatPercent, formatUsd } from "../lib/format";
import Link from "next/link";

function ruleLabel(item: PriceAlert) {
  const vol = item.volumeMultiplier ? ` · vol ≥ ${item.volumeMultiplier}× last seen` : "";
  if (item.kind === "change_24h") return `|24h| ≥ ${item.threshold}%${vol}`;
  return `${item.kind} ${formatUsd(item.threshold)}${vol}`;
}

function tailHonesty(analysis: AlertAnalysis) {
  if (analysis === "technical") {
    return " No on-chain whale feed on this instance — CoinVigil does not invent whale prints.";
  }
  return " Social sentiment is not wired (no NLP model). No on-chain whale feed — CoinVigil does not invent whale prints.";
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
  const [coinId, setCoinId] = useState(initialCoin);
  const [kind, setKind] = useState<AlertKind>(["above", "below", "change_24h"].includes(initialKind) ? initialKind : "above");
  const [sensitivity, setSensitivity] = useState<AlertSensitivity>("normal");
  const [analysis, setAnalysis] = useState<AlertAnalysis>("technical");
  const [volumeOn, setVolumeOn] = useState(false);
  const [threshold, setThreshold] = useState(initialKind === "change_24h" ? String(SENSITIVITY.normal.changePct) : "100000");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [lastVolume, setLastVolume] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!coinId && watched[0]) setCoinId(watched[0].id);
    if (coinId && watched.length && !watchIds.has(coinId) && watched[0]) setCoinId(watched[0].id);
  }, [watched, watchIds, coinId]);

  useEffect(() => {
    setLastVolume(readVolumeSeen());
  }, []);

  useEffect(() => {
    let active = true;
    async function refresh() {
      const ids = items.map((item) => item.coinId);
      const { byId, source: nextSource } = await hydrateQuotes(ids);
      if (!active) return;
      setAssets([...byId.values()]);
      setSource(nextSource);
      const seen = { ...readVolumeSeen() };
      for (const asset of byId.values()) {
        if (asset.total_volume != null) rememberVolume(asset.id, asset.total_volume);
      }
      setLastVolume(seen);
    }
    void refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [items]);

  const byId = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);

  function evalRow(item: PriceAlert) {
    const live = byId.get(item.coinId);
    return evaluateAlert(
      item,
      { price: live?.current_price, change24h: live?.price_change_percentage_24h, volume: live?.total_volume },
      { watched: watchIds.has(item.coinId), lastVolume: lastVolume[item.coinId] },
    );
  }

  const fired = items.filter((item) => evalRow(item).fired);
  const pendingNotes = fired.filter((item) => !item.note).map((item) => item.id).join(",");

  useEffect(() => {
    if (!pendingNotes) return;
    let cancelled = false;
    async function attachNotes() {
      for (const item of items) {
        if (!pendingNotes.split(",").includes(item.id) || item.note) continue;
        const insight = await getAssetInsight(item.coinId);
        if (cancelled) return;
        const body = item.analysis === "sentiment"
          ? "Social sentiment is not wired on this instance — no NLP model is configured. Quote context from tools follows."
          : insight.answer;
        patch(item.id, {
          note: {
            text: `${body}${tailHonesty(item.analysis)}`.slice(0, 800),
            engine: insight.engine || "heuristic-tools",
            generated: Boolean(insight.generated),
            at: new Date().toISOString(),
          },
        });
      }
    }
    void attachNotes();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- patch notes once per newly fired id
  }, [pendingNotes]);

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
    };
    if (editingId) {
      patch(editingId, payload);
      setEditingId(null);
      return;
    }
    add(payload);
  }

  return (
    <section className="card alerts-card">
      <div className="section-heading">
        <div>
          <div className="eyebrow">WATCHLIST ALERTS</div>
          <h2>Rule-based prefilter, then a grounded note</h2>
        </div>
        <span className="muted">{items.length} / {ALERTS_LIMIT} · {source === "demo" ? "Demo quotes" : "Snapshot quotes"}</span>
      </div>
      <p className="muted alerts-note">
        Only coins on your watchlist are evaluated — CoinVigil does not spam the whole market. Price/volume rules run
        before any AI cost. In-tab only; Telegram/Discord/push are documented later, not faked. No on-chain whale feed.
      </p>
      {fired.length ? (
        <p className="alerts-fired-banner" role="status">
          {fired.length} watchlist rule{fired.length === 1 ? "" : "s"} triggered in this snapshot (in-tab only — no push).
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
                className={result.fired ? "is-fired" : undefined}
                data-alert-coin={item.coinId}
                data-alert-status={result.status}
              >
                <div className="alert-copy">
                  <strong>
                    <Link href={`/asset/${item.coinId}`}>{live?.name || item.name}</Link>
                    {" "}
                    <span className="muted">{item.sensitivity} · {item.analysis}</span>
                  </strong>
                  <span className="muted">{ruleLabel(item)}</span>
                  <span className="muted">
                    {result.status === "off-watchlist"
                      ? "Off watchlist — not evaluated (never spam the whole market)"
                      : result.status === "volume-prefilter"
                        ? "Volume prefilter held this back vs last-seen 24h volume"
                        : live
                          ? `${formatUsd(live.current_price)} · ${formatPercent(live.price_change_percentage_24h)}`
                          : "Not in this snapshot yet"}
                  </span>
                  {result.fired && item.note ? (
                    <span className="alert-note">
                      {item.note.generated ? "AI-generated from tools" : "Heuristic tools"} · {item.note.engine}: {item.note.text}
                    </span>
                  ) : result.fired ? (
                    <span className="muted">Loading a tool-grounded note…</span>
                  ) : null}
                </div>
                <div className="alert-actions">
                  <span className={result.fired ? "pill" : "muted"}>
                    {result.fired ? "Triggered" : result.status === "off-watchlist" ? "Skipped" : "Watching"}
                  </span>
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
              <option value="sentiment">Social sentiment (stub)</option>
              <option value="all">All (sentiment stubbed)</option>
            </select>
          </label>
          <label className="checkbox-label">
            Volume prefilter
            <input type="checkbox" checked={volumeOn} onChange={(event) => setVolumeOn(event.target.checked)} />
            <span className="muted">{volumeOn ? `${SENSITIVITY[sensitivity].volumeMult}× last 24h volume seen in this browser` : "Off"}</span>
          </label>
          <button type="submit">{editingId ? "Save edit" : "Save locally"}</button>
        </form>
      )}
    </section>
  );
}
