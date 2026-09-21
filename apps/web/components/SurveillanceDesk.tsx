"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { MarketAsset, MarketMovers } from "../lib/api";
import { DEFAULT_COOLDOWN_MINUTES, SENSITIVITY, useAlerts } from "../lib/alerts";
import { useAlertHistory } from "../lib/alert-history";
import { changeClass, formatAge, formatPercent, formatTimestamp, formatUsd, sourceLabel } from "../lib/format";
import { useWatchlist } from "../lib/watchlist";
import { AlertsStrip } from "./AlertsStrip";
import { AskPanel } from "./AskPanel";
import { StatusBadge } from "./StatusBadge";
import { WatchButton } from "./WatchButton";
import { WatchlistStrip } from "./WatchlistStrip";

function seedAssets(assets: MarketAsset[]) {
  const preferred = assets.filter((asset) => ["bitcoin", "ethereum", "solana"].includes(asset.id));
  return (preferred.length ? preferred : assets).slice(0, 3);
}

export function SurveillanceDesk({
  assets,
  movers,
  source,
  stale,
}: {
  assets: MarketAsset[];
  movers: MarketMovers;
  source: string;
  stale?: boolean;
}) {
  const { items: watched, ids, toggle } = useWatchlist();
  const { items: alerts, add } = useAlerts();
  const { items: history } = useAlertHistory();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  const seeds = useMemo(() => seedAssets(assets), [assets]);
  const watchedQuotes = useMemo(() => {
    const rows = watched.map((item) => {
      const live = assets.find((asset) => asset.id === item.id);
      return { item, live };
    });
    return rows.sort((a, b) => Math.abs(b.live?.price_change_percentage_24h || 0) - Math.abs(a.live?.price_change_percentage_24h || 0));
  }, [watched, assets]);

  const lastFire = history[0];
  const first = watched[0];
  const hasRuleForFirst = first ? alerts.some((row) => row.coinId === first.id) : false;

  function saveStarterRule() {
    if (!first) return;
    add({
      coinId: first.id,
      symbol: first.symbol,
      name: first.name,
      kind: "change_24h",
      threshold: SENSITIVITY.normal.changePct,
      sensitivity: "normal",
      analysis: "technical",
      volumeMultiplier: null,
      muted: false,
      cooldownMinutes: DEFAULT_COOLDOWN_MINUTES,
    });
  }

  const emptyWatch = watched.length === 0;
  const topCard = !ready ? (
    <section className="card desk-skeleton" aria-busy="true">
      <div className="skeleton skeleton-chip" />
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-copy" />
      <div className="skeleton skeleton-row" />
      <div className="skeleton skeleton-row" />
    </section>
  ) : emptyWatch ? (
        <section className="card onboard-card" aria-label="Get started">
          <div className="section-heading">
            <div>
              <div className="eyebrow">WHY COINVIGIL</div>
              <h2>Watchlist → rules → smart alerts → Ask</h2>
            </div>
            <StatusBadge source={source} stale={stale} />
          </div>
          <p className="onboard-lead">
            CoinMarketCap ranks every coin. CoinVigil watches <strong>yours</strong>: star 1–3 coins (free),
            save a price or 24h rule, get a tool-backed note when it fires, then Ask about that list.
            Quotes are CoinGecko Live/cached or a labeled Demo — never invented. Telegram and Discord are not implemented.
            Informational research only — not financial advice.
          </p>
          <ol className="onboard-steps">
            <li className="is-on"><strong>1. Watchlist</strong> Star 1–3 coins in this snapshot.</li>
            <li><strong>2. Rules</strong> Price above/below or |24h| %. Volume prefilter optional.</li>
            <li><strong>3. Smart alerts</strong> Prefilter first, then a grounded note. History stays in this browser.</li>
            <li><strong>4. Ask</strong> Tool-backed Q&amp;A on watchlist coins — no buy/sell advice.</li>
          </ol>
          {seeds.length ? (
            <div className="seed-row">
              {seeds.map((asset) => (
                <div className="seed-chip" key={asset.id}>
                  <WatchButton id={asset.id} symbol={asset.symbol} name={asset.name} compact />
                  <button
                    type="button"
                    className="ghost tool-button"
                    onClick={() => toggle({ id: asset.id, symbol: asset.symbol, name: asset.name })}
                  >
                    Watch {asset.symbol.toUpperCase()}
                  </button>
                  <span className={changeClass(asset.price_change_percentage_24h)}>
                    {formatUsd(asset.current_price)} · {formatPercent(asset.price_change_percentage_24h)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Snapshot is empty — CoinVigil does not invent coins to star.</p>
          )}
          <p className="muted onboard-foot">
            Local only, no account. Free cap is 3 coins; local premium toggle raises it — not billing.
          </p>
        </section>
  ) : (
        <section className="card desk-status" aria-label="Your surveillance desk">
          <div className="section-heading">
            <div>
              <div className="eyebrow">YOUR DESK</div>
              <h2>Watchlist, rules, and Ask — not the whole market</h2>
            </div>
            <StatusBadge source={source} stale={stale} />
          </div>
          <p className="desk-meta">
            {watched.length} watched · {alerts.length} rule{alerts.length === 1 ? "" : "s"} · {history.length} fire{history.length === 1 ? "" : "s"} in history
            {lastFire ? ` · last fire ${formatTimestamp(lastFire.at) || "just now"} (${lastFire.delivered ? "webhook delivered" : "in-app / this browser"})` : " · no fires yet"}
            {" · "}{sourceLabel(source, { stale }).text}
          </p>
          {!hasRuleForFirst && first ? (
            <div className="desk-cta-row">
              <button type="button" onClick={saveStarterRule}>
                Save a {SENSITIVITY.normal.changePct}% 24h rule on {first.symbol.toUpperCase()}
              </button>
              <Link className="ghost tool-button" href="/alerts">Open alert builder</Link>
              <Link className="ghost tool-button" href="/alerts#alert-history">Fire history</Link>
            </div>
          ) : (
            <div className="desk-cta-row">
              <Link className="ghost tool-button" href="/alerts">Manage rules</Link>
              <Link className="ghost tool-button" href="/alerts#alert-history">Fire history</Link>
              <Link className="ghost tool-button" href="/ask">Ask CoinVigil</Link>
            </div>
          )}
          {watchedQuotes.length ? (
            <ul className="watched-movers" aria-label="Watched coin moves">
              {watchedQuotes.slice(0, 5).map(({ item, live }) => (
                <li key={item.id}>
                  <Link href={`/asset/${item.id}`}>
                    <strong>{(live?.symbol || item.symbol).toUpperCase()}</strong>
                    <span>{live ? formatUsd(live.current_price) : "Quote pending"}</span>
                    <span className={changeClass(live?.price_change_percentage_24h)}>
                      {live ? formatPercent(live.price_change_percentage_24h) : "—"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {history.length ? (
            <ul className="desk-fires" aria-label="Recent alert fires">
              {history.slice(0, 3).map((row) => (
                <li key={row.id}>
                  <Link href={`/asset/${row.coinId}`}>{row.symbol.toUpperCase()}</Link>
                  <time dateTime={row.at}>{formatTimestamp(row.at) || formatAge(row.at)}</time>
                  <span className="muted">{row.delivered ? "Webhook POST succeeded" : "In-app / this browser"}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
  );

  return (
    <section id="desk" className="surveillance-desk">
      {topCard}
      <div className="desk-grid">
        <WatchlistStrip assets={assets} />
        <AlertsStrip assets={assets} />
      </div>
      <AskPanel compact heading="Ask CoinVigil" />
      {!ids.size ? null : movers.gainers.length || movers.losers.length ? (
        <p className="muted desk-note">
          Universe movers stay below. The list above is only coins you star — CoinVigil does not alert the whole market.
        </p>
      ) : null}
    </section>
  );
}
