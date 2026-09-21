"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { MarketAsset } from "../lib/api";
import { changeClass, formatAge, formatPercent, formatUsd, sourceLabel } from "../lib/format";
import { hydrateQuotes } from "../lib/snapshot-quotes";
import { useWatchlist } from "../lib/watchlist";
import { PremiumToggle } from "./PremiumToggle";
import { WatchButton } from "./WatchButton";

function companionId(id: string) {
  return id.toLowerCase() === "bitcoin" ? "ethereum" : "bitcoin";
}

export function WatchlistStrip({ assets }: { assets: MarketAsset[] }) {
  const { items, cap, atCap, premium } = useWatchlist();
  const [extra, setExtra] = useState<MarketAsset[]>([]);
  const [source, setSource] = useState("unavailable");
  const [stale, setStale] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
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
      const ids = items.map((item) => item.id);
      if (!ids.length) {
        if (active) setExtra([]);
        return;
      }
      const snap = await hydrateQuotes(ids, assets);
      if (!active) return;
      setExtra([...snap.byId.values()]);
      setSource(snap.source);
      setStale(Boolean(snap.stale));
      setCheckedAt(snap.checkedAt);
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
  }, [items, assets]);

  const byId = useMemo(() => {
    const map = new Map<string, MarketAsset>();
    for (const asset of [...assets, ...extra]) map.set(asset.id, asset);
    return map;
  }, [assets, extra]);
  const compareHref = items.length >= 2
    ? `/compare?ids=${items.slice(0, 3).map((item) => item.id).join(",")}`
    : items.length === 1
      ? `/compare?ids=${items[0].id},${companionId(items[0].id)}`
      : "/compare";

  return (
    <section id="watchlist" className="card watchlist-card">
      <div className="section-heading">
        <div>
          <div className="eyebrow">WATCHLIST</div>
          <h2>Surveillance list — not the whole market</h2>
        </div>
        <div className="table-tools">
          <Link className="ghost tool-button" href="/alerts#create-alert">Create alert</Link>
          <Link className="ghost tool-button" href={compareHref}>
            {items.length >= 2 ? "Compare watched" : "Open Compare"}
          </Link>
          <span className="muted">
            {items.length} / {cap}
            {items.length ? ` · ${sourceLabel(source, { stale }).text} · ${formatAge(checkedAt, now)}` : ""}
          </span>
        </div>
      </div>
      <p className="muted alerts-note">
        Alerts only evaluate coins you star here. Free tier is {premium ? "unlocked locally" : "3 coins"} — the 4th star
        is blocked until the local premium toggle. Not billing. Telegram and Discord are not implemented; optional HTTPS webhook is env-gated.
      </p>
      <PremiumToggle />
      {atCap ? (
        <p className="alerts-fired-banner" role="status" id="watchlist-cap">
          {premium
            ? `Premium cap reached (${cap}). Remove a coin to star another.`
            : "Free watchlist is full (3/3). The 4th coin is blocked. Flip the local premium toggle to research more — not a payment."}
        </p>
      ) : null}
      {items.length === 0 ? (
        <div className="empty empty-panel">
          <strong>No surveillance coins yet</strong>
          <p>
            Use the seeds on the desk above, or star a coin in the rankings. Smart alerts never spam the whole market —
            only this list. Local only, no account.
          </p>
        </div>
      ) : (
        <div className="watchlist-list">
          {items.map((item) => {
            const live = byId.get(item.id);
            return (
              <div className="watchlist-row" key={item.id}>
                <WatchButton id={item.id} symbol={item.symbol} name={item.name} compact />
                <Link className="asset-link" href={`/asset/${item.id}`}>
                  <strong>{live?.name || item.name}</strong>
                  <span>{(live?.symbol || item.symbol).toUpperCase()}</span>
                </Link>
                <div className="watchlist-values">
                  <span>{live ? formatUsd(live.current_price) : "Quote pending"}</span>
                  <span className={changeClass(live?.price_change_percentage_24h)}>
                    {live ? formatPercent(live.price_change_percentage_24h) : "Looking up snapshot"}
                  </span>
                  <Link className="trade-link" href={`/alerts?coin=${item.id}`}>Alert</Link>
                  <Link className="trade-link" href={`/compare?ids=${item.id},${companionId(item.id)}`}>
                    Compare
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="watchlist-footnote muted">
        Saved in this browser — no account, no server copy. Alerts stay watchlist-scoped. Not financial advice.
      </p>
    </section>
  );
}
