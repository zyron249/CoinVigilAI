"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Candle, MarketAsset } from "../lib/api";
import { getCandles } from "../lib/api";
import { formatPercent, formatUsd, sourceLabel } from "../lib/format";
import { StatusBadge } from "./StatusBadge";

const RANGES: { id: string; label: string; days: number }[] = [
  { id: "1h", label: "1H", days: 1 },
  { id: "1d", label: "1D", days: 1 },
  { id: "1w", label: "1W", days: 7 },
  { id: "1m", label: "1M", days: 30 },
  { id: "1y", label: "1Y", days: 365 },
];

export function LiveChartPanel({ assets }: { assets: MarketAsset[] }) {
  const picks = useMemo(
    () => {
      const preferred = assets.filter((asset) => ["bitcoin", "ethereum", "solana", "binancecoin", "ripple"].includes(asset.id));
      return (preferred.length ? preferred : assets).slice(0, 5);
    },
    [assets],
  );
  const [coinId, setCoinId] = useState(picks[0]?.id || "bitcoin");
  const [range, setRange] = useState("1d");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [source, setSource] = useState("unavailable");
  const [busy, setBusy] = useState(false);
  const days = RANGES.find((row) => row.id === range)?.days ?? 1;
  const live = picks.find((row) => row.id === coinId) || picks[0];

  useEffect(() => {
    if (!picks.some((row) => row.id === coinId) && picks[0]) setCoinId(picks[0].id);
  }, [coinId, picks]);

  useEffect(() => {
    let active = true;
    setBusy(true);
    getCandles(coinId, days).then((payload) => {
      if (!active) return;
      setCandles(payload.data);
      setSource(payload.source);
      setBusy(false);
    });
    return () => {
      active = false;
    };
  }, [coinId, days]);

  const chart = useMemo(() => {
    const closes = candles.map((row) => row.close).filter((value) => Number.isFinite(value));
    if (closes.length < 2) return null;
    const width = 640;
    const height = 220;
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const span = max - min || 1;
    const coords = closes.map((value, index) => {
      const x = (index / (closes.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - 16) - 8;
      return [x, y] as const;
    });
    const line = coords.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    const area = `${line} L${width} ${height} L0 ${height} Z`;
    const up = closes[closes.length - 1] >= closes[0];
    return { line, area, up, width, height };
  }, [candles]);

  return (
    <section className="card live-chart-panel">
      <div className="section-heading">
        <div>
          <div className="eyebrow">LIVE MARKET CHART</div>
          <h2>{live ? `${live.symbol.toUpperCase()} · ${formatUsd(live.current_price)}` : "Chart"}</h2>
        </div>
        <StatusBadge source={source} />
      </div>
      <div className="chart-chip-row">
        <div className="chart-coins">
          {(picks.length ? picks : [{ id: "bitcoin", symbol: "btc", name: "Bitcoin" } as MarketAsset]).map((asset) => (
            <button
              key={asset.id}
              type="button"
              className={`ghost tool-button ${coinId === asset.id ? "is-on" : ""}`}
              onClick={() => setCoinId(asset.id)}
            >
              {asset.symbol.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="chart-ranges">
          {RANGES.map((row) => (
            <button
              key={row.id}
              type="button"
              className={`ghost tool-button ${range === row.id ? "is-on" : ""}`}
              onClick={() => setRange(row.id)}
            >
              {row.label}
            </button>
          ))}
        </div>
      </div>
      <p className="muted chart-honest">
        CoinGecko OHLC for the selected range — not a TradingView widget, not a WebSocket tick stream.
        {range === "1h" ? " 1H uses the same 1-day OHLC snap as 1D (CoinGecko does not give true hourly ticks here)." : ""}
        {live ? ` ${formatPercent(live.price_change_percentage_24h)} 24h in the rankings snapshot.` : ""}
        {sourceLabel(source).demo ? " Demo candles are labeled, never live." : ""}
      </p>
      <div className={`live-chart-canvas ${busy ? "is-busy" : ""}`}>
        {chart ? (
          <svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label={`${coinId} close prices`}>
            <defs>
              <linearGradient id="cv-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chart.up ? "#22f0a0" : "#ff5d7a"} stopOpacity="0.35" />
                <stop offset="100%" stopColor={chart.up ? "#22f0a0" : "#ff5d7a"} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={chart.area} fill="url(#cv-area)" />
            <path d={chart.line} fill="none" stroke={chart.up ? "#22f0a0" : "#ff5d7a"} strokeWidth="2.4" strokeLinejoin="round" />
          </svg>
        ) : (
          <div className="empty empty-panel">
            <strong>{busy ? "Loading OHLC" : "No candles"}</strong>
            <p>{busy ? "Fetching CoinGecko OHLC for this range." : "This snapshot has no candles. CoinVigil does not invent a chart."}</p>
          </div>
        )}
      </div>
      {live ? (
        <Link className="ghost tool-button chart-lab-link" href={`/asset/${live.id}#chart-lab`}>Open Chart Lab</Link>
      ) : null}
    </section>
  );
}
