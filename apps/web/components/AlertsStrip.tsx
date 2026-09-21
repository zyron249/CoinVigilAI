"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { MarketAsset } from "../lib/api";
import { alertFired, useAlerts, type PriceAlert } from "../lib/alerts";
import { hydrateQuotes } from "../lib/snapshot-quotes";
import { formatPercent, formatUsd } from "../lib/format";

function ruleLabel(item: PriceAlert) {
  return item.kind === "change_24h" ? `|24h| ≥ ${item.threshold}%` : `${item.kind} ${formatUsd(item.threshold)}`;
}

export function AlertsStrip({ assets }: { assets: MarketAsset[] }) {
  const { items } = useAlerts();
  const [extra, setExtra] = useState<MarketAsset[]>([]);

  useEffect(() => {
    const known = new Set(assets.map((asset) => asset.id));
    const missing = items.map((item) => item.coinId).filter((id) => !known.has(id));
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
  }, [items, assets]);

  const byId = useMemo(() => {
    const map = new Map<string, MarketAsset>();
    for (const asset of [...assets, ...extra]) map.set(asset.id, asset);
    return map;
  }, [assets, extra]);

  const fired = items.filter((item) => {
    const live = byId.get(item.coinId);
    return alertFired(item, live?.current_price, live?.price_change_percentage_24h);
  });

  return (
    <section id="alerts-dock" className="card alerts-card alerts-dock">
      <div className="section-heading">
        <div>
          <div className="eyebrow">PRICE ALERTS</div>
          <h2>{fired.length ? `${fired.length} triggered in this snapshot` : "Watching local rules"}</h2>
        </div>
        <Link className="ghost tool-button" href="/alerts">{items.length} rules</Link>
      </div>
      <p className="muted alerts-note">
        Evaluated here against the live table (and asset quotes if a rule is off-page). In-tab only — no push or email backend.
      </p>
      {items.length === 0 ? (
        <p className="muted alerts-note">No local rules yet. <Link href="/alerts">Create one</Link> — it stays in this browser.</p>
      ) : fired.length === 0 ? (
        <p className="muted alerts-note">No rules triggered against this snapshot. {items.length} still watching.</p>
      ) : (
        <ul className="alerts-list">
          {fired.slice(0, 4).map((item) => {
            const live = byId.get(item.coinId);
            return (
              <li key={item.id} className="is-fired">
                <div className="alert-copy">
                  <strong><Link href={`/asset/${item.coinId}`}>{item.name}</Link></strong>
                  <span className="muted">{ruleLabel(item)}</span>
                  <span className="muted">{live ? `${formatUsd(live.current_price)} · ${formatPercent(live.price_change_percentage_24h)}` : "Quote pending"}</span>
                </div>
                <span className="pill">Triggered</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
