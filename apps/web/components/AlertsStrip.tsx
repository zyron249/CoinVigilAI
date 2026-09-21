"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { MarketAsset } from "../lib/api";
import { alertStatusLabel, evaluateAlert, readVolumeSeen, useAlerts, type PriceAlert } from "../lib/alerts";
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

  useEffect(() => {
    setLastVolume(readVolumeSeen());
    const known = new Set(assets.map((asset) => asset.id));
    const missing = items.map((item) => item.coinId).filter((id) => watchIds.has(id) && !known.has(id));
    if (!missing.length) {
      setExtra([]);
      return;
    }
    let active = true;
    hydrateQuotes(missing, assets).then(({ byId }) => {
      if (active) setExtra([...byId.values()]);
    });
    return () => {
      active = false;
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
      { watched: watchIds.has(item.coinId), lastVolume: lastVolume[item.coinId] },
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
        Evaluated only for starred coins. Snapshot poll — no WebSocket. In-tab + local history — no push.
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
              { watched: watchIds.has(item.coinId), lastVolume: lastVolume[item.coinId] },
            );
            return (
              <li key={item.id} className="is-fired" data-alert-status={result.status}>
                <div className="alert-copy">
                  <strong><Link href={`/asset/${item.coinId}`}>{live?.name || item.name}</Link></strong>
                  <span className="muted">{ruleLabel(item)}</span>
                  <span className="muted">{live ? `${formatUsd(live.current_price)} · ${formatPercent(live.price_change_percentage_24h)}` : "Quote pending"}</span>
                  {item.note ? <span className="alert-note">{item.note.generated ? "AI" : "Heuristic"}: {item.note.text}</span> : null}
                </div>
                <span className="pill">{alertStatusLabel(result.status)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
