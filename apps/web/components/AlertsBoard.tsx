"use client";

import { useEffect, useMemo, useState } from "react";
import type { MarketAsset } from "../lib/api";
import { ALERTS_LIMIT, alertFired, useAlerts, type AlertKind } from "../lib/alerts";
import { hydrateQuotes } from "../lib/snapshot-quotes";
import { formatPercent, formatUsd } from "../lib/format";
import Link from "next/link";

export function AlertsBoard({
  initialCoin = "bitcoin",
  initialKind = "above",
}: {
  initialCoin?: string;
  initialKind?: AlertKind;
}) {
  const { items, add, remove } = useAlerts();
  const [assets, setAssets] = useState<MarketAsset[]>([]);
  const [source, setSource] = useState("unavailable");
  const [coinId, setCoinId] = useState(initialCoin);
  const [kind, setKind] = useState<AlertKind>(["above", "below", "change_24h"].includes(initialKind) ? initialKind : "above");
  const [threshold, setThreshold] = useState(initialKind === "change_24h" ? "5" : "100000");

  useEffect(() => {
    let active = true;
    async function refresh() {
      const { byId, source: nextSource } = await hydrateQuotes(items.map((item) => item.coinId));
      if (!active) return;
      setAssets([...byId.values()]);
      setSource(nextSource);
    }
    void refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [items]);

  const byId = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const fired = items.filter((item) => {
    const live = byId.get(item.coinId);
    return alertFired(item, live?.current_price, live?.price_change_percentage_24h);
  });

  function addAlert() {
    const id = coinId.trim().toLowerCase();
    const value = Number(threshold);
    if (!id || !Number.isFinite(value)) return;
    const live = byId.get(id);
    add({
      coinId: id,
      symbol: live?.symbol || id,
      name: live?.name || id,
      kind,
      threshold: value,
    });
  }

  return (
    <section className="card alerts-card">
      <div className="section-heading">
        <div>
          <div className="eyebrow">PRICE ALERTS</div>
          <h2>Local rules in this browser</h2>
        </div>
        <span className="muted">{items.length} / {ALERTS_LIMIT} · {source === "demo" ? "Demo quotes" : "Snapshot quotes"}</span>
      </div>
      <p className="muted alerts-note">
        Rules evaluate against the current CoinGecko snapshot in this tab and on Markets/asset pages. There is no push or
        email backend yet — a later PR can add notifications. CoinVigil does not invent prices to trip a rule.
      </p>
      {fired.length ? (
        <p className="alerts-fired-banner" role="status">
          {fired.length} rule{fired.length === 1 ? "" : "s"} triggered in this snapshot (in-tab only — no push).
        </p>
      ) : null}
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
            const on = alertFired(item, live?.current_price, live?.price_change_percentage_24h);
            return (
              <li key={item.id} className={on ? "is-fired" : undefined}>
                <div className="alert-copy">
                  <strong>
                    <Link href={`/asset/${item.coinId}`}>{item.name}</Link>
                  </strong>
                  <span className="muted">
                    {item.kind === "change_24h" ? `|24h| ≥ ${item.threshold}%` : `${item.kind} ${formatUsd(item.threshold)}`}
                  </span>
                  <span className="muted">
                    {live
                      ? `${formatUsd(live.current_price)} · ${formatPercent(live.price_change_percentage_24h)}`
                      : "Not in this snapshot yet — will retry this tab"}
                  </span>
                </div>
                <div className="alert-actions">
                  <span className={on ? "pill" : "muted"}>{on ? "Triggered" : "Watching"}</span>
                  <button type="button" className="ghost tool-button" onClick={() => remove(item.id)}>Delete</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
