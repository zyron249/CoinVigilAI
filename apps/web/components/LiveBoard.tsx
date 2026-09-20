"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { GlobalOverview, MarketMovers, MarketPage } from "../lib/api";
import { getGlobalOverview, getMarket, getMovers } from "../lib/api";
import { sourceLabel } from "../lib/format";
import { DemoRibbon } from "./DemoRibbon";
import { GlobalStrip } from "./GlobalStrip";
import { MarketTable } from "./MarketTable";
import { Movers } from "./Movers";

const POLL_MS = 30_000;

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
  });
  const assetsRef = useRef(initialMarket.assets);
  const ticketRef = useRef(0);
  assetsRef.current = market.assets;

  const loadMarket = useCallback(async (
    next: Partial<{ page: number; limit: number; sort: string; order: string }> = {},
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
      if (nextOverview.source !== "unavailable") setOverview(nextOverview);
      if (nextMovers.source !== "unavailable") setMovers(nextMovers);
      setCheckedAt(new Date().toISOString());
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
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
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [loadMarket]);

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
