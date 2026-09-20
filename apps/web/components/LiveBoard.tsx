"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { GlobalOverview, MarketMovers, MarketPage } from "../lib/api";
import { getGlobalOverview, getMarket, getMovers } from "../lib/api";
import { sourceLabel } from "../lib/format";
import { DemoRibbon } from "./DemoRibbon";
import { GlobalStrip } from "./GlobalStrip";
import { MarketTable } from "./MarketTable";
import { Movers } from "./Movers";
import { WatchlistStrip } from "./WatchlistStrip";

const POLL_MS = 30_000;
const MIN_TICK_MS = 8_000;

export function LiveBoard({
  initialMarket,
  initialOverview,
  initialMovers,
  hero,
  brief,
  radar,
}: {
  initialMarket: MarketPage;
  initialOverview: GlobalOverview;
  initialMovers: MarketMovers;
  hero: ReactNode;
  brief: ReactNode;
  radar: ReactNode;
}) {
  const [market, setMarket] = useState(initialMarket);
  const [overview, setOverview] = useState(initialOverview);
  const [movers, setMovers] = useState(initialMovers);
  const [busy, setBusy] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(initialMarket.error ?? null);
  const [checkedAt, setCheckedAt] = useState<string | null>(initialMarket.as_of ?? null);
  const queryRef = useRef({
    page: initialMarket.page,
    limit: initialMarket.limit,
    sort: initialMarket.sort,
    order: initialMarket.order,
    q: initialMarket.query || "",
  });
  const assetsRef = useRef(initialMarket.assets);
  const ticketRef = useRef(0);
  const lastTickRef = useRef(0);
  assetsRef.current = market.assets;

  const loadMarket = useCallback(async (
    next: Partial<{ page: number; limit: number; sort: string; order: string; q: string }> = {},
    silent = false,
  ) => {
    const query = { ...queryRef.current, ...next };
    queryRef.current = query;
    const ticket = ++ticketRef.current;
    if (!silent) setBusy(true);
    const result = await getMarket(query);
    if (ticket !== ticketRef.current) return;
    if (result.error && result.assets.length === 0 && assetsRef.current.length > 0) {
      setRefreshError("Could not refresh rankings. Showing the last loaded snapshot.");
    } else {
      setRefreshError(result.error ?? null);
      setMarket(result);
    }
    if (!silent) {
      const [nextOverview, nextMovers] = await Promise.all([
        getGlobalOverview(),
        getMovers(5),
      ]);
      if (ticket !== ticketRef.current) return;
      if (nextOverview.source !== "unavailable") setOverview(nextOverview);
      if (nextMovers.source !== "unavailable") setMovers(nextMovers);
      setCheckedAt(new Date().toISOString());
      lastTickRef.current = Date.now();
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function tick(force = false) {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (!force && Date.now() - lastTickRef.current < MIN_TICK_MS) return;
      lastTickRef.current = Date.now();
      const [nextOverview, nextMovers] = await Promise.all([
        getGlobalOverview(),
        getMovers(5),
        loadMarket({}, true),
      ]);
      if (cancelled) return;
      if (nextOverview.source !== "unavailable") setOverview(nextOverview);
      if (nextMovers.source !== "unavailable") setMovers(nextMovers);
      setCheckedAt(new Date().toISOString());
    }

    const id = window.setInterval(() => { void tick(); }, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") void tick();
    };
    const onOnline = () => { void tick(true); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onOnline);
    };
  }, [loadMarket]);

  const watchAssets = useMemo(() => {
    const seen = new Set<string>();
    const rows = [];
    for (const asset of [...market.assets, ...movers.gainers, ...movers.losers]) {
      if (seen.has(asset.id)) continue;
      seen.add(asset.id);
      rows.push(asset);
    }
    return rows;
  }, [market.assets, movers.gainers, movers.losers]);

  return (
    <>
      <DemoRibbon
        source={market.source}
        lastLiveAt={market.last_live_at}
        stale={market.stale}
        fallbackReason={market.fallback_reason}
      />
      {hero}
      <GlobalStrip overview={overview} checkedAt={checkedAt} />
      {brief}
      <WatchlistStrip assets={watchAssets} />
      <section className="slice-grid" id="movers">
        <Movers gainers={movers.gainers} losers={movers.losers} source={movers.source} stale={movers.stale} />
        <div id="radar">{radar}</div>
      </section>
      <p className="movers-footnote muted">
        24h gainers are up; 24h losers are down. Ranked from the CoinVigil universe ({sourceLabel(movers.source, { stale: movers.stale }).text}).
        Prices are never invented.
      </p>
      <section id="markets" className="markets-board">
        <MarketTable
          pageData={market}
          busy={busy}
          refreshError={refreshError}
          checkedAt={checkedAt}
          onQuery={(next) => { void loadMarket(next); }}
        />
      </section>
    </>
  );
}
