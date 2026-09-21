"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { MarketAsset } from "../lib/api";
import { evaluateAlert, readVolumeSeen, rowStatusLabel, useAlerts, type PriceAlert } from "../lib/alerts";
import { hydrateQuotes } from "../lib/snapshot-quotes";
import { useWatchlist } from "../lib/watchlist";
import { formatPercent, formatUsd } from "../lib/format";

function ruleLabel(item: PriceAlert) {
  return item.kind === "change_24h" ? `|24h| ≥ ${item.threshold}%` : `${item.kind} ${formatUsd(item.threshold)}`;
}

export function AlertsStrip({ assets }: { assets: MarketAsset[] }) {
  const { items } = useAlerts();
  const { ids: watchIds } = useWatchlist();
  const [extra, setExtra] = useState<MarketAsset[]>([]);
  const [lastVolume, setLastVolume] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    async function refresh() {
      if (timer) window.clearTimeout(timer);
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        timer = window.setTimeout(refresh, 30_000);
        return;
      }
      setLastVolume(readVolumeSeen());
      const ids = items.map((item) => item.coinId).filter((id) => watchIds.has(id));
      if (!ids.length) {
        if (active) setExtra([]);
        timer = window.setTimeout(refresh, 10_000);
        return;
      }
      const { byId } = await hydrateQuotes(ids, assets);
      if (!active) return;
      setExtra([...byId.values()]);
      timer = window.setTimeout(refresh, 10_000);
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
  }, [items, assets, watchIds]);

  const byId = useMemo(() => {
    const map = new Map<string, MarketAsset>();
    for (const asset of [...assets, ...extra]) map.set(asset.id, asset);
    return map;
  }, [assets, extra]);

  const matching = items.filter((item) => {
    const live = byId.get(item.coinId);
    return evaluateAlert(
      item,
      { price: live?.current_price, change24h: live?.price_change_percentage_24h, volume: live?.total_volume },
      { watched: watchIds.has(item.coinId), lastVolume: lastVolume[item.coinId], now },
    ).matching;
  });

  return (
    <section id="alerts-dock" className="card alerts-card alerts-dock">
      <div className="section-heading">
        <div>
          <div className="eyebrow">WATCHLIST ALERTS</div>
          <h2>{matching.length ? `${matching.length} matching on your list` : "Watchlist-scoped only"}</h2>
        </div>
        <div className="table-tools">
          <Link className="ghost tool-button" href="/alerts#alert-history">History</Link>
          <Link className="ghost tool-button" href="/alerts">{items.length} rules</Link>
        </div>
      </div>
      <p className="muted alerts-note">
        Evaluated only for starred coins. Snapshot poll — no WebSocket. In-tab + local history — Telegram is not implemented.
      </p>
      {items.length === 0 ? (
        <p className="muted alerts-note">No local rules yet. <Link href="/alerts">Create one</Link> for a watchlist coin.</p>
      ) : matching.length === 0 ? (
        <p className="muted alerts-note">No watchlist rules matching this snapshot. Off-list coins are never alerted.</p>
      ) : (
        <ul className="alerts-list">
          {matching.slice(0, 4).map((item) => {
            const live = byId.get(item.coinId);
            const result = evaluateAlert(
              item,
              { price: live?.current_price, change24h: live?.price_change_percentage_24h, volume: live?.total_volume },
              { watched: watchIds.has(item.coinId), lastVolume: lastVolume[item.coinId], now },
            );
            return (
              <li key={item.id} className="is-fired" data-alert-status={result.status}>
                <div className="alert-copy">
                  <strong><Link href={`/asset/${item.coinId}`}>{live?.name || item.name}</Link></strong>
                  <span className="muted">{ruleLabel(item)}</span>
                  <span className="muted">{live ? `${formatUsd(live.current_price)} · ${formatPercent(live.price_change_percentage_24h)}` : "Quote pending"}</span>
                  {item.note ? <span className="alert-note">{item.note.generated ? "AI" : "Heuristic"}: {item.note.text}</span> : null}
                </div>
                <span className="pill">{rowStatusLabel(result.status, item, now)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
