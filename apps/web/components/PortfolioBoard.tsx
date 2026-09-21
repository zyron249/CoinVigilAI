"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { MarketAsset } from "../lib/api";
import { aggregateHoldings, lotPnl, PORTFOLIO_LIMIT, usePortfolio } from "../lib/portfolio";
import { hydrateQuotes } from "../lib/snapshot-quotes";
import { changeClass, formatPercent, formatUsd } from "../lib/format";
import { StatusBadge } from "./StatusBadge";

export function PortfolioBoard({ initialCoin = "bitcoin" }: { initialCoin?: string }) {
  const { items, add, remove } = usePortfolio();
  const [assets, setAssets] = useState<MarketAsset[]>([]);
  const [source, setSource] = useState("unavailable");
  const [coinId, setCoinId] = useState(initialCoin);
  const [qty, setQty] = useState("1");
  const [cost, setCost] = useState("");

  useEffect(() => {
    let active = true;
    async function refresh() {
      const { byId, source: nextSource } = await hydrateQuotes(items.map((row) => row.coinId));
      if (!active) return;
      setAssets([...byId.values()]);
      setSource(nextSource);
    }
    void refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [items]);

  const byId = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);

  const totals = useMemo(
    () => aggregateHoldings(items, byId),
    [items, byId],
  );

  function submit() {
    const id = coinId.trim().toLowerCase();
    const amount = Number(qty);
    const costUsd = cost.trim() === "" ? null : Number(cost);
    if (!id || !Number.isFinite(amount) || amount <= 0) return;
    if (costUsd != null && !Number.isFinite(costUsd)) return;
    const live = byId.get(id);
    add({
      coinId: id,
      symbol: live?.symbol || id,
      name: live?.name || id,
      qty: amount,
      costUsd,
    });
    setQty("1");
    setCost("");
  }

  return (
    <section className="card portfolio-card">
      <div className="section-heading">
        <div>
          <div className="eyebrow">LOCAL HOLDINGS</div>
          <h2>Lots in this browser</h2>
        </div>
        {items.length ? <StatusBadge source={source} /> : <span className="muted">0 / {PORTFOLIO_LIMIT}</span>}
      </div>
      <p className="muted alerts-note">
        Add quantity plus optional total cost. P&amp;L uses this CoinGecko snapshot — CoinVigil does not invent prices,
        does not custody funds, and does not connect wallets or private keys. {items.length} / {PORTFOLIO_LIMIT} lots.
      </p>
      <form
        className="alerts-form portfolio-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label>
          Coin id
          <input value={coinId} onChange={(event) => setCoinId(event.target.value)} placeholder="bitcoin" />
        </label>
        <label>
          Quantity
          <input type="number" min="0" step="any" value={qty} onChange={(event) => setQty(event.target.value)} />
        </label>
        <label>
          Cost USD (optional)
          <input type="number" min="0" step="any" value={cost} onChange={(event) => setCost(event.target.value)} placeholder="total basis" />
        </label>
        <button type="submit" disabled={items.length >= PORTFOLIO_LIMIT}>Save locally</button>
      </form>
      <div className="portfolio-totals">
        <div>
          <span className="muted">Snapshot value</span>
          <strong>{formatUsd(totals.value)}</strong>
        </div>
        <div>
          <span className="muted">Cost basis</span>
          <strong>{totals.costUsd != null ? formatUsd(totals.costUsd) : "—"}</strong>
        </div>
        <div>
          <span className="muted">Unrealized P&amp;L</span>
          <strong className={changeClass(totals.pnl)}>
            {totals.pnl != null ? `${formatUsd(totals.pnl)}${totals.costUsd ? ` · ${formatPercent((totals.pnl / totals.costUsd) * 100)}` : ""}` : "Add a cost to see P&L"}
            {totals.comparable && totals.comparable < items.length ? (
              <span className="muted"> · from {totals.comparable} lot{totals.comparable === 1 ? "" : "s"} with quote and cost</span>
            ) : null}
          </strong>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="empty empty-panel">
          <strong>No local lots yet</strong>
          <p>
            This is a holdings stub, not a broker. Rows stay in this browser. For research lists use the
            {" "}<Link href="/#watchlist">watchlist</Link>.
          </p>
        </div>
      ) : (
        <ul className="alerts-list">
          {items.map((row) => {
            const live = byId.get(row.coinId);
            const stats = lotPnl(row.qty, live?.current_price, row.costUsd);
            return (
              <li key={row.id}>
                <div className="alert-copy">
                  <strong>
                    <Link href={`/asset/${row.coinId}`}>{live?.name || row.name}</Link>
                    {" "}
                    <span className="muted">{row.qty} {(live?.symbol || row.symbol).toUpperCase()}</span>
                  </strong>
                  <span className="muted">
                    {live ? `${formatUsd(live.current_price)} · ${formatPercent(live.price_change_percentage_24h)}` : "Not in this snapshot"}
                  </span>
                  <span className={changeClass(stats.pnl)}>
                    Value {formatUsd(stats.value)}
                    {stats.pnl != null ? ` · P&L ${formatUsd(stats.pnl)}` : " · no cost basis"}
                  </span>
                </div>
                <div className="alert-actions">
                  <Link className="ghost tool-button" href={`/alerts?coin=${row.coinId}`}>Alert</Link>
                  <button type="button" className="ghost tool-button" onClick={() => remove(row.id)}>Remove</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
