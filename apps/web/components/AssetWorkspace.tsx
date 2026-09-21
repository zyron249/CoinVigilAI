"use client";

import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import type { AssetTickers, Candle } from "../lib/api";
import { ExchangeMarkets } from "./ExchangeMarkets";
import { ProChartLab } from "./ProChartLab";
import { queueWorkspaceScroll, scrollAssetWorkspace, workspaceHashId } from "../lib/scroll-workspace";

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
      setTab(tabFromHash(window.location.hash));
    }
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  useEffect(() => {
    if (!workspaceHashId()) return;
    queueWorkspaceScroll(tab === "chart" ? 180 : 0);
  }, [tab]);

  useEffect(() => {
    let timer = 0;
    function onResize() {
      if (!workspaceHashId()) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { scrollAssetWorkspace(); }, 120);
    }
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  function selectTab(next: "markets" | "chart") {
    setTab(next);
    const hash = next === "chart" ? "chart-lab" : "markets-tab";
    const url = new URL(window.location.href);
    url.hash = hash;
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    queueWorkspaceScroll(next === "chart" ? 180 : 0);
  }

  return (
    <section className="asset-workspace">
      <div className="asset-workspace-anchors">
        <div id="markets-tab" className="asset-workspace-anchor" tabIndex={-1} />
        <div id="chart-lab" className="asset-workspace-anchor" tabIndex={-1} />
      </div>
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
