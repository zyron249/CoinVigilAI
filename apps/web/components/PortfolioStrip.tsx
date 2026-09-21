"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { MarketAsset } from "../lib/api";
import { lotPnl, usePortfolio } from "../lib/portfolio";
import { hydrateQuotes } from "../lib/snapshot-quotes";
import { changeClass, formatPercent, formatUsd } from "../lib/format";

export function PortfolioStrip({ assets }: { assets: MarketAsset[] }) {
  const { items } = usePortfolio();
  const [extra, setExtra] = useState<MarketAsset[]>([]);

  useEffect(() => {
    const known = new Set(assets.map((asset) => asset.id));
    const missing = items.map((row) => row.coinId).filter((id) => !known.has(id));
    if (!missing.length) {
      setExtra([]);
      return;
    }
    let active = true;
    hydrateQuotes(missing, assets).then(({ byId }) => {
      if (active) setExtra([...byId.values()]);
    });
    return () => {
      active = false;
    };
  }, [items, assets]);

  const byId = useMemo(() => {
    const map = new Map<string, MarketAsset>();
    for (const asset of [...assets, ...extra]) map.set(asset.id, asset);
    return map;
  }, [assets, extra]);

  let value = 0;
  let valued = 0;
  let costUsd = 0;
  let costed = 0;
  for (const row of items) {
    const stats = lotPnl(row.qty, byId.get(row.coinId)?.current_price, row.costUsd);
    if (stats.value != null) {
      value += stats.value;
      valued += 1;
    }
    if (stats.cost != null) {
      costUsd += stats.cost;
      costed += 1;
    }
  }
  const pnl = costed && valued ? value - costUsd : null;

  return (
    <section id="portfolio-dock" className="card portfolio-card">
      <div className="section-heading">
        <div>
          <div className="eyebrow">PORTFOLIO STUB</div>
          <h2>{items.length ? "Local lots vs this snapshot" : "Holdings stay in this browser"}</h2>
        </div>
        <Link className="ghost tool-button" href="/portfolio">Open ledger</Link>
      </div>
      {items.length === 0 ? (
        <p className="muted alerts-note">
          No lots yet. This is not a wallet — CoinVigil never asks for keys. <Link href="/portfolio">Add a quantity</Link>.
        </p>
      ) : (
        <div className="portfolio-totals">
          <div>
            <span className="muted">Value</span>
            <strong>{formatUsd(valued ? value : null)}</strong>
          </div>
          <div>
            <span className="muted">P&amp;L</span>
            <strong className={changeClass(pnl)}>
              {pnl != null ? `${formatUsd(pnl)}${costUsd ? ` · ${formatPercent((pnl / costUsd) * 100)}` : ""}` : "Add a cost basis"}
            </strong>
          </div>
          <div>
            <span className="muted">Lots</span>
            <strong>{items.length}</strong>
          </div>
        </div>
      )}
    </section>
  );
}
