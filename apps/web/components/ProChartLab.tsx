"use client";

import { useEffect, useRef, useState } from "react";
import { getCandles, type Candle } from "../lib/api";
import { formatUsd, sourceLabel } from "../lib/format";

type ProChartLabProps = {
  coinId: string;
  symbol: string;
  candles: Candle[];
  source: string;
  tickerSource?: string;
  tapePrice?: number | null;
};

const RANGES: { id: string; label: string; days: number }[] = [
  { id: "1h", label: "1H", days: 1 },
  { id: "24h", label: "24H", days: 1 },
  { id: "7d", label: "7D", days: 7 },
  { id: "30d", label: "30D", days: 30 },
  { id: "1y", label: "1Y", days: 365 },
];

function pricePrecision(candles: Candle[]) {
  const last = candles.at(-1)?.close ?? 1;
  if (last >= 1000) return 2;
  if (last >= 1) return 4;
  if (last >= 0.01) return 6;
  return 8;
}

export function ProChartLab({ coinId, symbol, candles, source, tickerSource, tapePrice }: ProChartLabProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const disposeRef = useRef<((container: HTMLElement) => void) | null>(null);
  const [drawing, setDrawing] = useState<string | null>(null);
  const [range, setRange] = useState("24h");
  const [series, setSeries] = useState(candles);
  const [seriesSource, setSeriesSource] = useState(source);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(candles.length ? "Loading chart…" : "No candles in this snapshot");
  const days = RANGES.find((row) => row.id === range)?.days ?? 1;

  useEffect(() => {
    let active = true;
    setBusy(true);
    getCandles(coinId, days).then((payload) => {
      if (!active) return;
      setSeries(payload.data);
      setSeriesSource(payload.source);
      setBusy(false);
    });
    return () => {
      active = false;
    };
  }, [coinId, days]);

  useEffect(() => {
    let active = true;
    const container = containerRef.current;
    if (!container || series.length === 0) {
      setDrawing(null);
      setStatus("No candles in this snapshot");
      return;
    }

    (async () => {
      const lib = await import("klinecharts");
      if (!active || !containerRef.current) return;

      const chart = lib.init(containerRef.current, {
        locale: "en-US",
        timezone: "UTC",
        styles: "dark",
        layout: {
          barSpaceLimit: { min: 2, max: 40 },
          pane: { minHeight: 120 },
          yAxis: { position: "right" },
        },
      });

      if (!chart) {
        setStatus("Chart could not initialize");
        return;
      }

      chart.setSymbol({
        ticker: symbol.toUpperCase(),
        pricePrecision: pricePrecision(series),
        volumePrecision: 2,
      });
      chart.setPeriod({ span: 1, type: "day" });
      chart.setDataLoader({
        getBars: ({ callback }: any) => {
          callback(series, { forward: false, backward: false });
        },
      });
      if (series.length >= 10) {
        chart.createIndicator({ name: "MA", paneId: "candle_pane" }, true);
      }

      chartRef.current = chart;
      disposeRef.current = lib.dispose;
      setStatus(`${symbol.toUpperCase()} · ${series.length} candles · ${sourceLabel(seriesSource).text}`);
    })().catch((error) => {
      setStatus(`Chart error: ${error instanceof Error ? error.message : "unknown"}`);
    });

    return () => {
      active = false;
      setDrawing(null);
      if (container && disposeRef.current) {
        disposeRef.current(container);
      }
      chartRef.current = null;
    };
  }, [series, symbol, seriesSource]);

  useEffect(() => {
    if (!drawing) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      const chart = chartRef.current;
      if (chart?.removeOverlay) chart.removeOverlay();
      setDrawing(null);
      setStatus("Drawing cancelled");
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawing]);

  function draw(name: string, label: string) {
    const chart = chartRef.current;
    if (!chart) return;
    chart.createOverlay({ name, mode: "weak_magnet", modeSensitivity: 8 });
    setDrawing(label);
    setStatus(`${label}: click the chart to place points. Escape cancels.`);
  }

  function addIndicator(name: string) {
    const chart = chartRef.current;
    if (!chart) return;
    const existing = chart.getIndicators?.({ name }) ?? [];
    if (existing.length > 0) {
      setStatus(`${name} is already active`);
      return;
    }
    if (["MA", "EMA", "BOLL", "SAR"].includes(name)) {
      chart.createIndicator({ name, paneId: "candle_pane" }, true);
    } else {
      chart.createIndicator(name);
    }
    setStatus(`${name} indicator added`);
  }

  function undoLastDrawing() {
    const chart = chartRef.current;
    if (!chart) return;
    const overlays = chart.getOverlays?.() ?? [];
    const last = overlays.at(-1);
    if (!last?.id) {
      setStatus("No drawing to undo");
      setDrawing(null);
      return;
    }
    chart.removeOverlay({ id: last.id });
    setDrawing(null);
    setStatus("Last drawing removed");
  }

  function clearDrawings() {
    const chart = chartRef.current;
    if (!chart) return;
    chart.removeOverlay();
    setDrawing(null);
    setStatus("All drawings cleared");
  }

  function exportPng() {
    const chart = chartRef.current;
    if (!chart) return;
    const url = chart.getConvertPictureUrl?.(true, "png", "#07100f");
    if (!url) {
      setStatus("Image export is unavailable");
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `coinvigil-${coinId}-chart.png`;
    anchor.click();
    setStatus("Chart PNG exported");
  }

  const empty = series.length === 0;
  const lastClose = series.at(-1)?.close;
  const diverge = Boolean(
    tapePrice
    && lastClose
    && Number.isFinite(lastClose)
    && Math.abs(lastClose - tapePrice) / Math.max(Math.abs(tapePrice), 1) > 0.015,
  );
  const mixed = (seriesSource === "demo" || seriesSource === "unavailable")
    && (tickerSource === "coingecko" || tickerSource === "cache");

  return (
    <section className="chart-lab card">
      <div className="chart-lab-head">
        <div>
          <div className="eyebrow">{sourceLabel(seriesSource).demo ? "DEMO CANDLES" : "CHART"}</div>
          <h2>{symbol.toUpperCase()} {sourceLabel(seriesSource).demo ? "labeled demo series" : "technical workspace"}</h2>
        </div>
        <span className="chart-status" role="status">{busy && empty ? "Loading OHLC…" : status}</span>
      </div>
      <div className="chart-ranges" role="tablist" aria-label="Chart range">
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
      <p className="muted chart-honest">
        CoinGecko OHLC for the selected range — not a TradingView widget, not a WebSocket tick stream.
        {range === "1h" ? " 1H uses the same 1-day OHLC snap as 24H (CoinGecko does not give true hourly ticks here)." : ""}
        {sourceLabel(seriesSource).demo ? " Demo candles are labeled, never live." : ""}
        {diverge ? ` Last OHLC close ${formatUsd(lastClose)} vs tape ${formatUsd(tapePrice)} — candles are a different series.` : ""}
      </p>
      {mixed ? (
        <div className="source-ribbon demo-ribbon mixed-ribbon" role="status">
          <strong>Mixed snapshot: live listings, demo candles.</strong>
          <span>
            {" "}Exchange Markets are {sourceLabel(tickerSource).text}. These OHLC bars are a labeled demo series
            because CoinGecko candles were rate-limited or unavailable. This is not a live chart, and not financial advice.
          </span>
        </div>
      ) : null}

      <div className="chart-toolbar" role="toolbar" aria-label="Drawing tools">
        <button type="button" className="tool-button" disabled={empty} onClick={() => draw("segment", "Trend line")}>Trend</button>
        <button type="button" className="tool-button" disabled={empty} onClick={() => draw("horizontalStraightLine", "Horizontal level")}>H-Level</button>
        <button type="button" className="tool-button" disabled={empty} onClick={() => draw("fibonacciLine", "Fibonacci")}>Fibonacci</button>
        <button type="button" className="tool-button" disabled={empty} onClick={() => draw("brush", "Brush")}>Brush</button>
        <button type="button" className="tool-button" disabled={empty} onClick={() => draw("priceLine", "Price line")}>Price line</button>
        <span className="toolbar-divider" />
        {series.length >= 10 ? <button type="button" className="tool-button" disabled={empty} onClick={() => addIndicator("MA")}>MA</button> : null}
        {series.length >= 10 ? <button type="button" className="tool-button" disabled={empty} onClick={() => addIndicator("EMA")}>EMA</button> : null}
        {series.length >= 20 ? <button type="button" className="tool-button" disabled={empty} onClick={() => addIndicator("BOLL")}>BOLL</button> : null}
        <button type="button" className="tool-button" disabled={empty} onClick={() => addIndicator("RSI")}>RSI</button>
        <button type="button" className="tool-button" disabled={empty} onClick={() => addIndicator("MACD")}>MACD</button>
        <span className="toolbar-divider" />
        <button type="button" className="tool-button ghost" disabled={empty} onClick={undoLastDrawing}>Undo drawing</button>
        <button type="button" className="tool-button ghost" disabled={empty} onClick={clearDrawings}>Clear</button>
        <button type="button" className="tool-button ghost" disabled={empty} onClick={exportPng}>Export PNG</button>
      </div>

      {empty ? (
        <div className="empty empty-panel chart-empty">
          <strong>No candles in this snapshot</strong>
          <p>
            CoinVigil does not invent OHLC bars or ghost drawings. Tools stay disabled until a real
            CoinGecko or labeled demo series is available.
          </p>
        </div>
      ) : (
        <div
          ref={containerRef}
          className={`chart-canvas ${drawing ? "is-drawing" : ""}`}
          aria-label={`${symbol} interactive candlestick chart`}
          onPointerDown={() => {
            if (drawing) setStatus(`${drawing}: keep clicking to finish, or press Escape to cancel.`);
          }}
        />
      )}
      <div className="chart-footnote">
        {empty ? (
          "Empty chart is intentional — missing data is never filled with synthetic live candles."
        ) : drawing ? (
          <>{drawing} is armed. Click the plot to place points. Escape cancels the overlay. Source: <strong>{sourceLabel(source).text}</strong>.</>
        ) : (
          <>Drawings are interactive and editable. Market data source: <strong>{sourceLabel(source).text}</strong>.</>
        )}
      </div>
    </section>
  );
}
