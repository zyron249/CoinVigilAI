"use client";

import { useEffect, useRef, useState } from "react";
import type { Candle } from "../lib/api";

type ProChartLabProps = {
  coinId: string;
  symbol: string;
  candles: Candle[];
  source: string;
};

function pricePrecision(candles: Candle[]) {
  const last = candles.at(-1)?.close ?? 1;
  if (last >= 1000) return 2;
  if (last >= 1) return 4;
  if (last >= 0.01) return 6;
  return 8;
}

export function ProChartLab({ coinId, symbol, candles, source }: ProChartLabProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const disposeRef = useRef<((container: HTMLElement) => void) | null>(null);
  const [status, setStatus] = useState("Chart ready");

  useEffect(() => {
    let active = true;
    const container = containerRef.current;
    if (!container || candles.length === 0) return;

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
        pricePrecision: pricePrecision(candles),
        volumePrecision: 2,
      });
      chart.setPeriod({ span: 1, type: "day" });
      chart.setDataLoader({
        getBars: ({ callback }: any) => {
          callback(candles, { forward: false, backward: false });
        },
      });
      chart.createIndicator({ name: "MA", paneId: "candle_pane" }, true);

      chartRef.current = chart;
      disposeRef.current = lib.dispose;
      setStatus(`${symbol.toUpperCase()} · ${candles.length} candles · ${source}`);
    })().catch((error) => {
      setStatus(`Chart error: ${error instanceof Error ? error.message : "unknown"}`);
    });

    return () => {
      active = false;
      if (container && disposeRef.current) {
        disposeRef.current(container);
      }
      chartRef.current = null;
    };
  }, [candles, symbol, source]);

  function draw(name: string, label: string) {
    const chart = chartRef.current;
    if (!chart) return;
    chart.createOverlay({ name, mode: "weak_magnet", modeSensitivity: 8 });
    setStatus(`${label}: tap/click the chart to place points`);
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
      return;
    }
    chart.removeOverlay({ id: last.id });
    setStatus("Last drawing removed");
  }

  function clearDrawings() {
    const chart = chartRef.current;
    if (!chart) return;
    chart.removeOverlay();
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

  return (
    <section className="chart-lab card">
      <div className="chart-lab-head">
        <div>
          <div className="eyebrow">PRO CHART LAB</div>
          <h2>{symbol.toUpperCase()} technical workspace</h2>
        </div>
        <span className="chart-status">{status}</span>
      </div>

      <div className="chart-toolbar" aria-label="Drawing tools">
        <button className="tool-button" onClick={() => draw("segment", "Trend line")}>Trend</button>
        <button className="tool-button" onClick={() => draw("horizontalStraightLine", "Horizontal level")}>H-Level</button>
        <button className="tool-button" onClick={() => draw("fibonacciLine", "Fibonacci")}>Fibonacci</button>
        <button className="tool-button" onClick={() => draw("brush", "Brush")}>Brush</button>
        <button className="tool-button" onClick={() => draw("priceLine", "Price line")}>Price line</button>
        <span className="toolbar-divider" />
        <button className="tool-button" onClick={() => addIndicator("MA")}>MA</button>
        <button className="tool-button" onClick={() => addIndicator("EMA")}>EMA</button>
        <button className="tool-button" onClick={() => addIndicator("BOLL")}>BOLL</button>
        <button className="tool-button" onClick={() => addIndicator("RSI")}>RSI</button>
        <button className="tool-button" onClick={() => addIndicator("MACD")}>MACD</button>
        <span className="toolbar-divider" />
        <button className="tool-button ghost" onClick={undoLastDrawing}>Undo drawing</button>
        <button className="tool-button ghost" onClick={clearDrawings}>Clear</button>
        <button className="tool-button ghost" onClick={exportPng}>Export PNG</button>
      </div>

      <div ref={containerRef} className="chart-canvas" aria-label={`${symbol} interactive candlestick chart`} />
      <div className="chart-footnote">
        Drawings are interactive and editable on the chart. Market data source: <strong>{source}</strong>.
      </div>
    </section>
  );
}
