"use client";

import Link from "next/link";
import { alertFired, useAlerts } from "../lib/alerts";
import { formatPercent, formatUsd } from "../lib/format";

export function AssetAlerts({
  coinId,
  symbol,
  name,
  price,
  change24h,
}: {
  coinId: string;
  symbol: string;
  name: string;
  price?: number | null;
  change24h?: number | null;
}) {
  const { items } = useAlerts();
  const mine = items.filter((item) => item.coinId === coinId);
  const fired = mine.filter((item) => alertFired(item, price, change24h));

  return (
    <section className="card alerts-card asset-alerts" id="asset-alerts">
      <div className="section-heading">
        <div>
          <div className="eyebrow">LOCAL ALERTS</div>
          <h2>{fired.length ? "Triggered against this quote" : "Watch this level"}</h2>
        </div>
        <Link className="ghost tool-button" href={`/alerts?coin=${coinId}`}>
          New rule
        </Link>
      </div>
      <p className="muted alerts-note">
        {name} is {formatUsd(price)} ({formatPercent(change24h)} 24h) in this snapshot. Rules evaluate in this tab only —
        no push backend. CoinVigil does not invent a trip price.
      </p>
      {mine.length === 0 ? (
        <p className="muted alerts-note">
          No local {symbol.toUpperCase()} rules yet.{" "}
          <Link href={`/alerts?coin=${coinId}&kind=above`}>Price above</Link>
          {" · "}
          <Link href={`/alerts?coin=${coinId}&kind=below`}>Price below</Link>
        </p>
      ) : (
        <ul className="alerts-list">
          {mine.map((item) => {
            const on = alertFired(item, price, change24h);
            return (
              <li key={item.id} className={on ? "is-fired" : undefined}>
                <div className="alert-copy">
                  <strong>{item.kind === "change_24h" ? `|24h| ≥ ${item.threshold}%` : `${item.kind} ${formatUsd(item.threshold)}`}</strong>
                  <span className="muted">{formatUsd(price)}</span>
                </div>
                <span className={on ? "pill" : "muted"}>{on ? "Triggered" : "Watching"}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
