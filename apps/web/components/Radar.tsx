import Link from "next/link";
import type { RadarSignal } from "../lib/api";

export function Radar({ signals }: { signals: RadarSignal[] }) {
  return (
    <div className="card radar-card">
      <div className="section-heading">
        <div>
          <div className="eyebrow">MARKET RADAR</div>
          <h2>Momentum &amp; risk flags</h2>
        </div>
      </div>
      <div className="radar-list">
        {signals.length === 0 ? (
          <div className="empty empty-panel">
            <strong>No radar flags</strong>
            <p>No elevated 24h moves or risk flags in this snapshot. Quiet markets stay blank instead of being padded.</p>
          </div>
        ) : signals.slice(0, 6).map((signal, index) => (
          <Link className="radar-item" key={`${signal.asset_id}-${signal.signal}-${index}`} href={`/asset/${signal.asset_id}`}>
            <div>
              <strong>{signal.symbol}</strong>
              <span>{signal.signal}</span>
            </div>
            <div className="radar-values">
              <span className={signal.change_24h >= 0 ? "positive" : "negative"}>{signal.change_24h >= 0 ? "+" : ""}{signal.change_24h.toFixed(2)}%</span>
              <span className={`pill ${signal.severity}`}>{signal.severity}</span>
            </div>
          </Link>
        ))}
      </div>
      <p className="radar-footnote muted">Heuristic flags from 24h change and the risk score — not an AI model vote.</p>
    </div>
  );
}
