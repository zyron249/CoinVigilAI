"use client";

import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import type { AssetTickers, Candle } from "../lib/api";
import { ExchangeMarkets } from "./ExchangeMarkets";
import { ProChartLab } from "./ProChartLab";

function tabFromHash(hash = ""): "markets" | "chart" {
  const value = hash.replace(/^#/, "");
  if (value === "chart" || value === "chart-lab") return "chart";
  return "markets";
}

export function AssetWorkspace({
  coinId,
  symbol,
  tickers,
  candles,
  candleSource,
}: {
  coinId: string;
  symbol: string;
  tickers: AssetTickers;
  candles: Candle[];
  candleSource: string;
}) {
  const [tab, setTab] = useState<"markets" | "chart">("markets");

  useEffect(() => {
    function applyHash() {
      const next = tabFromHash(window.location.hash);
      setTab(next);
    }
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  function selectTab(next: "markets" | "chart") {
    setTab(next);
    const hash = next === "chart" ? "chart-lab" : "markets-tab";
    const url = new URL(window.location.href);
    url.hash = hash;
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    requestAnimationFrame(() => {
      document.getElementById(next === "markets" ? "markets-tab" : "chart-lab")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <section className="asset-workspace">
      <div className="asset-tabs" role="tablist" aria-label="Asset views">
        <TabButton current={tab} id="markets" onSelect={selectTab}>Markets</TabButton>
        <TabButton current={tab} id="chart" onSelect={selectTab}>Chart</TabButton>
      </div>
      {tab === "markets" ? (
        <div role="tabpanel" id="panel-markets" aria-labelledby="tab-markets">
          <ExchangeMarkets coinId={coinId} symbol={symbol} initial={tickers} />
        </div>
      ) : (
        <div role="tabpanel" id="panel-chart" aria-labelledby="tab-chart">
          <ProChartLab
            coinId={coinId}
            symbol={symbol}
            candles={candles}
            source={candleSource}
            tickerSource={tickers.source}
          />
        </div>
      )}
    </section>
  );
}

function TabButton({
  current,
  id,
  onSelect,
  children,
}: {
  current: "markets" | "chart";
  id: "markets" | "chart";
  onSelect: (tab: "markets" | "chart") => void;
  children: ReactNode;
}) {
  const selected = current === id;
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      onSelect(id === "markets" ? "chart" : "markets");
    }
  }
  return (
    <button
      type="button"
      role="tab"
      id={`tab-${id}`}
      aria-selected={selected}
      aria-controls={`panel-${id}`}
      tabIndex={selected ? 0 : -1}
      className={`asset-tab ${selected ? "is-on" : "ghost"}`}
      onClick={() => onSelect(id)}
      onKeyDown={onKeyDown}
    >
      {children}
    </button>
  );
}
