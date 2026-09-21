"use client";

import Link from "next/link";
import { evaluateAlert, readVolumeSeen, useAlerts } from "../lib/alerts";
import { useWatchlist } from "../lib/watchlist";
import { formatPercent, formatUsd } from "../lib/format";

export function AssetAlerts({
  coinId,
  symbol,
  name,
  price,
  change24h,
  volume,
}: {
  coinId: string;
  symbol: string;
  name: string;
  price?: number | null;
  change24h?: number | null;
  volume?: number | null;
}) {
  const { items } = useAlerts();
  const { ids } = useWatchlist();
  const watched = ids.has(coinId);
  const lastVolume = readVolumeSeen()[coinId];
  const mine = items.filter((item) => item.coinId === coinId);
  const fired = mine.filter((item) => evaluateAlert(
    item,
    { price, change24h, volume },
    { watched, lastVolume },
  ).fired);

  return (
    <section className="card alerts-card asset-alerts" id="asset-alerts">
      <div className="section-heading">
        <div>
          <div className="eyebrow">WATCHLIST ALERTS</div>
          <h2>{watched ? (fired.length ? "Triggered against this quote" : "Watch this level") : "Star this coin to alert"}</h2>
        </div>
        {watched ? (
          <Link className="ghost tool-button" href={`/alerts?coin=${coinId}`}>New rule</Link>
        ) : (
          <Link className="ghost tool-button" href="/#watchlist">Open watchlist</Link>
        )}
      </div>
      <p className="muted alerts-note">
        {name} is {formatUsd(price)} ({formatPercent(change24h)} 24h) in this snapshot.
        {watched
          ? " Rules for this starred coin evaluate in this tab only — no push."
          : " Alerts never spam the whole market. Star it first (free cap 3)."}
        {" "}CoinVigil does not invent trip prices or on-chain whale prints.
      </p>
      {!watched ? (
        <p className="muted alerts-note">
          Not on your watchlist — no alert will fire for {symbol.toUpperCase()} even if an old rule exists.
        </p>
      ) : mine.length === 0 ? (
        <p className="muted alerts-note">
          No local {symbol.toUpperCase()} rules yet.{" "}
          <Link href={`/alerts?coin=${coinId}&kind=above`}>Price above</Link>
          {" · "}
          <Link href={`/alerts?coin=${coinId}&kind=change_24h`}>24h change</Link>
        </p>
      ) : (
        <ul className="alerts-list">
          {mine.map((item) => {
            const result = evaluateAlert(item, { price, change24h, volume }, { watched, lastVolume });
            return (
              <li key={item.id} className={result.fired ? "is-fired" : undefined}>
                <div className="alert-copy">
                  <strong>{item.kind === "change_24h" ? `|24h| ≥ ${item.threshold}%` : `${item.kind} ${formatUsd(item.threshold)}`}</strong>
                  <span className="muted">{formatUsd(price)}</span>
                  {result.fired && item.note ? <span className="alert-note">{item.note.text}</span> : null}
                </div>
                <span className={result.fired ? "pill" : "muted"}>{result.fired ? "Triggered" : result.status === "off-watchlist" ? "Skipped" : "Watching"}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
