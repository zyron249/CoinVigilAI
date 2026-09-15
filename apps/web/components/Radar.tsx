import type { RadarSignal } from "../lib/api";

export function Radar({ signals }: { signals: RadarSignal[] }) {
  return (
    <div className="card radar-card">
      <div className="section-heading">
        <div>
          <div className="eyebrow">AI RADAR</div>
          <h2>Market signals</h2>
        </div>
      </div>
      <div className="radar-list">
        {signals.length === 0 ? (
          <div className="empty">No elevated signals detected right now.</div>
        ) : signals.slice(0, 6).map((signal) => (
          <div className="radar-item" key={`${signal.asset_id}-${signal.signal}`}>
            <div>
              <strong>{signal.symbol}</strong>
              <span>{signal.signal}</span>
            </div>
            <div className="radar-values">
              <span className={signal.change_24h >= 0 ? "positive" : "negative"}>{signal.change_24h >= 0 ? "+" : ""}{signal.change_24h.toFixed(2)}%</span>
              <span className={`pill ${signal.severity}`}>{signal.severity}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
