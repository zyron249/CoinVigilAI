"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { alertStatusLabel, evaluateAlert, readVolumeSeen, useAlerts } from "../lib/alerts";
import { hydrateQuotes } from "../lib/snapshot-quotes";
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
  const [quote, setQuote] = useState({ price, change24h, volume });

  useEffect(() => {
    setQuote({ price, change24h, volume });
  }, [price, change24h, volume]);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    async function refresh() {
      if (timer) window.clearTimeout(timer);
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        timer = window.setTimeout(refresh, 30_000);
        return;
      }
      const { byId } = await hydrateQuotes([coinId]);
      const live = byId.get(coinId);
      if (!active) return;
      if (live) {
        setQuote({
          price: live.current_price,
          change24h: live.price_change_percentage_24h,
          volume: live.total_volume,
        });
      }
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
  }, [coinId]);

  const mine = items.filter((item) => item.coinId === coinId);
  const matching = mine.filter((item) => evaluateAlert(
    item,
    quote,
    { watched, lastVolume },
  ).matching);

  return (
    <section className="card alerts-card asset-alerts" id="asset-alerts">
      <div className="section-heading">
        <div>
          <div className="eyebrow">WATCHLIST ALERTS</div>
          <h2>{watched ? (matching.length ? "Matching this snapshot" : "Watch this level") : "Star this coin to alert"}</h2>
        </div>
        {watched ? (
          <Link className="ghost tool-button" href={`/alerts?coin=${coinId}`}>New rule</Link>
        ) : (
          <Link className="ghost tool-button" href="/#watchlist">Open watchlist</Link>
        )}
      </div>
      <p className="muted alerts-note">
        {name} is {formatUsd(quote.price)} ({formatPercent(quote.change24h)} 24h) in this snapshot.
        {watched
          ? " Rules for this starred coin poll the CoinGecko snapshot in this tab — no WebSocket, no push."
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
            const result = evaluateAlert(item, quote, { watched, lastVolume });
            return (
              <li
                key={item.id}
                className={result.matching ? "is-fired" : undefined}
                data-alert-coin={item.coinId}
                data-alert-status={result.status}
              >
                <div className="alert-copy">
                  <strong>{item.kind === "change_24h" ? `|24h| ≥ ${item.threshold}%` : `${item.kind} ${formatUsd(item.threshold)}`}</strong>
                  <span className="muted">{formatUsd(quote.price)}</span>
                  {result.matching && item.note ? <span className="alert-note">{item.note.text}</span> : null}
                </div>
                <span className={result.matching ? "pill" : "muted"}>{alertStatusLabel(result.status)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
