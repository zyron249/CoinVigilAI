"use client";

import { useEffect, useMemo, useState } from "react";
import type { MarketAsset } from "../lib/api";
import { getMarket } from "../lib/api";
import { ALERTS_EVENT, ALERTS_KEY, ALERTS_LIMIT, alertFired, parseAlerts, serializeAlerts, type AlertKind, type PriceAlert } from "../lib/alerts";
import { formatPercent, formatUsd } from "../lib/format";

function readAlerts(): PriceAlert[] {
  if (typeof window === "undefined") return [];
  return parseAlerts(window.localStorage.getItem(ALERTS_KEY));
}

function writeAlerts(items: PriceAlert[]) {
  const next = items.slice(0, ALERTS_LIMIT);
  window.localStorage.setItem(ALERTS_KEY, serializeAlerts(next));
  window.dispatchEvent(new CustomEvent(ALERTS_EVENT));
  return next;
}

export function AlertsBoard() {
  const [items, setItems] = useState<PriceAlert[]>([]);
  const [assets, setAssets] = useState<MarketAsset[]>([]);
  const [coinId, setCoinId] = useState("bitcoin");
  const [kind, setKind] = useState<AlertKind>("above");
  const [threshold, setThreshold] = useState("100000");

  useEffect(() => {
    const sync = () => setItems(readAlerts());
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(ALERTS_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(ALERTS_EVENT, sync);
    };
  }, []);

  useEffect(() => {
    let active = true;
    getMarket({ limit: 100, page: 1 }).then((page) => {
      if (active) setAssets(page.assets);
    });
    return () => {
      active = false;
    };
  }, []);

  const byId = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);

  function addAlert() {
    const id = coinId.trim().toLowerCase();
    const value = Number(threshold);
    if (!id || !Number.isFinite(value)) return;
    const live = byId.get(id);
    const next: PriceAlert = {
      id: `${id}-${kind}-${value}-${Date.now()}`,
      coinId: id,
      symbol: live?.symbol || id,
      name: live?.name || id,
      kind,
      threshold: value,
      createdAt: new Date().toISOString(),
    };
    setItems(writeAlerts([next, ...items]));
  }

  function removeAlert(id: string) {
    setItems(writeAlerts(items.filter((item) => item.id !== id)));
  }

  return (
    <section className="card alerts-card">
      <div className="section-heading">
        <div>
          <div className="eyebrow">PRICE ALERTS</div>
          <h2>Local rules in this browser</h2>
        </div>
        <span className="muted">{items.length} / {ALERTS_LIMIT}</span>
      </div>
      <p className="muted alerts-note">
        Rules evaluate against the current CoinGecko snapshot in this tab. There is no push or email backend yet —
        a later PR can add notifications. CoinVigil does not invent prices to trip a rule.
      </p>
      <form
        className="alerts-form"
        onSubmit={(event) => {
          event.preventDefault();
          addAlert();
        }}
      >
        <label>
          Coin id
          <input value={coinId} onChange={(event) => setCoinId(event.target.value)} placeholder="bitcoin" />
        </label>
        <label>
          Rule
          <select value={kind} onChange={(event) => setKind(event.target.value as AlertKind)}>
            <option value="above">Price above USD</option>
            <option value="below">Price below USD</option>
            <option value="change_24h">|24h change| at least %</option>
          </select>
        </label>
        <label>
          Threshold
          <input type="number" step="any" value={threshold} onChange={(event) => setThreshold(event.target.value)} />
        </label>
        <button type="submit">Save locally</button>
      </form>
      {items.length === 0 ? (
        <div className="empty empty-panel">
          <strong>No local alerts yet</strong>
          <p>Create a price or 24h-change rule. It stays in this browser only — no account, no push.</p>
        </div>
      ) : (
        <ul className="alerts-list">
          {items.map((item) => {
            const live = byId.get(item.coinId);
            const fired = alertFired(item, live?.current_price, live?.price_change_percentage_24h);
            return (
              <li key={item.id} className={fired ? "is-fired" : undefined}>
                <div>
                  <strong>{item.name}</strong>
                  <span className="muted">
                    {item.kind === "change_24h" ? `|24h| ≥ ${item.threshold}%` : `${item.kind} ${formatUsd(item.threshold)}`}
                  </span>
                  <span className="muted">
                    {live
                      ? `${formatUsd(live.current_price)} · ${formatPercent(live.price_change_percentage_24h)}`
                      : "Not in this snapshot"}
                  </span>
                </div>
                <div className="alert-actions">
                  <span className={fired ? "pill" : "muted"}>{fired ? "Triggered in this snapshot" : "Watching"}</span>
                  <button type="button" className="ghost tool-button" onClick={() => removeAlert(item.id)}>Delete</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
