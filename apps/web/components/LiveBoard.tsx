"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { GlobalOverview, MarketMovers, MarketPage } from "../lib/api";
import { getGlobalOverview, getMarket, getMovers } from "../lib/api";
import { sourceLabel } from "../lib/format";
import { writeMarketQuery } from "../lib/pagination";
import { AlertsStrip } from "./AlertsStrip";
import { AskPanel } from "./AskPanel";
import { DemoRibbon } from "./DemoRibbon";
import { PortfolioStrip } from "./PortfolioStrip";
import { GlobalStrip } from "./GlobalStrip";
import { MarketTable } from "./MarketTable";
import { Movers } from "./Movers";
import { WatchlistStrip } from "./WatchlistStrip";

const POLL_MS = 30_000;
const MIN_TICK_MS = 8_000;
const SEARCH_MS = 280;

export function LiveBoard({
  initialMarket,
  initialOverview,
  initialMovers,
  hero,
  brief,
  radar,
  rail,
  topCryptos,
  radarStrip,
}: {
  initialMarket: MarketPage;
  initialOverview: GlobalOverview;
  initialMovers: MarketMovers;
  hero: ReactNode;
  brief: ReactNode;
  radar: ReactNode;
  rail?: ReactNode;
  topCryptos?: ReactNode;
  radarStrip?: ReactNode;
}) {
  const [market, setMarket] = useState(initialMarket);
  const [overview, setOverview] = useState(initialOverview);
  const [movers, setMovers] = useState(initialMovers);
  const [busy, setBusy] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(initialMarket.error ?? null);
  const [checkedAt, setCheckedAt] = useState<string | null>(initialMarket.as_of ?? null);
  const [draft, setDraft] = useState(initialMarket.query || "");
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
    writeMarketQuery({
      q: query.q || "",
      page: query.page,
      limit: query.limit,
      sort: query.sort,
      order: query.order === "asc" ? "asc" : "desc",
    });
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

    const delay = market.partial ? MIN_TICK_MS : POLL_MS;
    const id = window.setInterval(() => { void tick(); }, delay);
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
  }, [loadMarket, market.partial]);

  useEffect(() => {
    if (!market.partial) return;
    const id = window.setTimeout(() => { void loadMarket({}, true); }, 3500);
    return () => window.clearTimeout(id);
  }, [loadMarket, market.partial, market.universe_size]);

  useEffect(() => {
    if (draft.trim() !== (queryRef.current.q || "").trim()) return;
    setDraft(market.query || "");
  }, [draft, market.query]);

  useEffect(() => {
    const next = draft.trim();
    const current = (queryRef.current.q || "").trim();
    if (next === current) return;
    const timer = window.setTimeout(() => {
      void loadMarket({ q: draft, page: 1 });
    }, SEARCH_MS);
    return () => window.clearTimeout(timer);
  }, [draft, loadMarket]);

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
      <section className="card finder-dock" id="find-asset" aria-label="Find a CoinGecko-tracked asset">
        <div className="finder-copy">
          <div className="eyebrow">FIND AN ASSET</div>
          <h2>Search this CoinGecko snapshot</h2>
          <p className={`coverage-count ${market.partial ? "is-partial" : ""}`}>
            {market.universe_size} of {market.coverage_target || 1000} CoinGecko-tracked assets in this snapshot
            {market.partial ? " — partial (later /coins/markets pages were rate-limited)." : "."}
            {" "}Not every coin on earth.
          </p>
        </div>
        <form
          className="market-search finder-search"
          onSubmit={(event) => {
            event.preventDefault();
            void loadMarket({ q: draft, page: 1 });
            document.getElementById("markets")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        >
          <label className="sr-only" htmlFor="hero-market-search">Search name, symbol, or id</label>
          <input
            id="hero-market-search"
            name="q"
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search name, symbol, or id — then jump to the asset"
            autoComplete="off"
            aria-busy={busy}
            aria-describedby="market-results-status"
          />
          <button type="submit">Search</button>
        </form>
        {market.query && market.assets.length > 0 ? (
          <div className="jump-row">
            <span className="muted">Open:</span>
            {market.assets.slice(0, 5).map((asset) => (
              <Link className="jump-chip" key={asset.id} href={`/asset/${asset.id}`}>
                {asset.name} <span>{asset.symbol.toUpperCase()}</span>
              </Link>
            ))}
            {market.assets.length >= 2 ? (
              <Link
                className="jump-chip"
                href={`/compare?ids=${market.assets.slice(0, 3).map((asset) => asset.id).join(",")}`}
              >
                Compare these
              </Link>
            ) : null}
          </div>
        ) : market.assets.length >= 2 ? (
          <div className="jump-row">
            <span className="muted">Jump:</span>
            {market.assets.slice(0, 3).map((asset) => (
              <Link className="jump-chip" key={asset.id} href={`/asset/${asset.id}`}>
                {asset.name} <span>{asset.symbol.toUpperCase()}</span>
              </Link>
            ))}
            <Link
              className="jump-chip"
              href={`/compare?ids=${market.assets.slice(0, 2).map((asset) => asset.id).join(",")}`}
            >
              Compare {market.assets[0].symbol.toUpperCase()} vs {market.assets[1].symbol.toUpperCase()}
            </Link>
          </div>
        ) : null}
      </section>
      {market.partial ? (
        <p className="source-ribbon cache-ribbon" role="status">
          <strong>Partial CoinGecko snapshot.</strong>
          {" "}Showing {market.universe_size} of {market.coverage_target || 1000} assets because later market pages were rate-limited or empty.
          {" "}A follow-up pass is scheduled — CoinVigil does not invent coins to fill the table.
        </p>
      ) : null}
      <AskPanel compact heading="Ask CoinVigil" />
      <GlobalStrip overview={overview} checkedAt={checkedAt} />
      <div className="dash-grid">
        <div className="dash-main">
          {topCryptos}
          {brief}
          <AlertsStrip assets={watchAssets} />
          <WatchlistStrip assets={watchAssets} />
          <PortfolioStrip assets={watchAssets} />
          {radarStrip}
          <section className="slice-grid" id="movers">
            <Movers gainers={movers.gainers} losers={movers.losers} source={movers.source} stale={movers.stale} />
            <div id="radar-flags">{radar}</div>
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
              draft={draft}
              onDraft={setDraft}
              onQuery={(next) => { void loadMarket(next); }}
            />
          </section>
        </div>
        {rail ? <aside className="dash-rail">{rail}</aside> : null}
      </div>
    </>
  );
}
