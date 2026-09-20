"use client";

import { useState, type ReactNode } from "react";
import type { AssetTickers, Candle } from "../lib/api";
import { ExchangeMarkets } from "./ExchangeMarkets";
import { ProChartLab } from "./ProChartLab";

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

  return (
    <section className="asset-workspace">
      <div className="asset-tabs" role="tablist" aria-label="Asset views">
        <TabButton current={tab} id="markets" onSelect={setTab}>Markets</TabButton>
        <TabButton current={tab} id="chart" onSelect={setTab}>Chart</TabButton>
      </div>
      {tab === "markets" ? (
        <div role="tabpanel" id="panel-markets" aria-labelledby="tab-markets">
          <ExchangeMarkets coinId={coinId} symbol={symbol} initial={tickers} />
        </div>
      ) : (
        <div role="tabpanel" id="panel-chart" aria-labelledby="tab-chart">
          <ProChartLab coinId={coinId} symbol={symbol} candles={candles} source={candleSource} />
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
  return (
    <button
      type="button"
      role="tab"
      id={`tab-${id}`}
      aria-selected={selected}
      aria-controls={`panel-${id}`}
      className={`asset-tab ${selected ? "is-on" : "ghost"}`}
      onClick={() => onSelect(id)}
    >
      {children}
    </button>
  );
}
