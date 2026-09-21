import Link from "next/link";
import type { MarketAsset, RadarSignal } from "../lib/api";
import { formatPercent } from "../lib/format";

function toneClass(change: number) {
  if (change >= 15) return "radar-chip is-hot";
  if (change >= 5) return "radar-chip is-up";
  if (change <= -10) return "radar-chip is-down";
  return "radar-chip is-quiet";
}

export function TokenRadarStrip({
  signals,
  gainers,
}: {
  signals: RadarSignal[];
  gainers: MarketAsset[];
}) {
  const cards: { id: string; symbol: string; label: string; change: number; href: string }[] = [];
  for (const signal of signals.slice(0, 4)) {
    cards.push({
      id: signal.asset_id,
      symbol: signal.symbol,
      label: signal.signal.replace(/_/g, " "),
      change: signal.change_24h,
      href: `/asset/${signal.asset_id}`,
    });
  }
  if (cards.length < 4) {
    for (const asset of gainers) {
      if (cards.some((row) => row.id === asset.id)) continue;
      cards.push({
        id: asset.id,
        symbol: asset.symbol,
        label: "24h gainer",
        change: asset.price_change_percentage_24h ?? 0,
        href: `/asset/${asset.id}`,
      });
      if (cards.length >= 4) break;
    }
  }

  return (
    <section className="card token-radar-strip" id="radar">
      <div className="section-heading">
        <div>
          <div className="eyebrow">TOKEN RADAR</div>
          <h2>Snapshot movers — not invented tickers</h2>
        </div>
        <Link className="ghost tool-button" href="/#markets">View all</Link>
      </div>
      {cards.length === 0 ? (
        <div className="empty empty-panel">
          <strong>No radar flags</strong>
          <p>No elevated 24h moves in this snapshot. Quiet markets stay blank instead of being padded with fake $DOGAI pumps.</p>
        </div>
      ) : (
        <div className="radar-chip-row">
          {cards.map((card) => (
            <Link className={toneClass(card.change)} key={`${card.id}-${card.label}`} href={card.href}>
              <span className="muted">{card.label}</span>
              <strong>${card.symbol.toUpperCase()}</strong>
              <em className={card.change >= 0 ? "positive" : "negative"}>{formatPercent(card.change)}</em>
            </Link>
          ))}
        </div>
      )}
      <p className="radar-footnote muted">Heuristic 24h change and risk flags from the CoinGecko snapshot — not an AI pick list.</p>
    </section>
  );
}
