"use client";

import Link from "next/link";
import { formatAge, formatUsd } from "../lib/format";
import { useAlertHistory } from "../lib/alert-history";

export function AlertHistory() {
  const { items, clear } = useAlertHistory();
  return (
    <section className="card alerts-card" id="alert-history">
      <div className="section-heading">
        <div>
          <div className="eyebrow">FIRE HISTORY</div>
          <h2>In-app only — this browser</h2>
        </div>
        {items.length ? (
          <button type="button" className="ghost tool-button" onClick={() => clear()}>Clear history</button>
        ) : null}
      </div>
      <p className="muted alerts-note">
        Fires are stored locally after the price/volume prefilter. Cooldown prevents duplicate rows. Optional webhook
        delivery is recorded only when the API actually POSTs — CoinVigil does not fake Telegram, Discord, or push.
      </p>
      {items.length === 0 ? (
        <div className="empty empty-panel">
          <strong>No fires yet</strong>
          <p>When a watchlist rule notifies, it lands here. Clearing history does not delete the rule.</p>
        </div>
      ) : (
        <ul className="alerts-list">
          {items.map((row) => (
            <li key={row.id} data-history-coin={row.coinId}>
              <div className="alert-copy">
                <strong><Link href={`/asset/${row.coinId}`}>{row.name}</Link> <span className="muted">{row.kind} {formatUsd(row.threshold)}</span></strong>
                <span className="muted">{formatAge(row.at)} · {row.price != null ? formatUsd(row.price) : "quote unknown"} · {row.delivered ? "webhook delivered" : "in-app only"}</span>
                {row.note ? <span className="alert-note">{row.note.text}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
