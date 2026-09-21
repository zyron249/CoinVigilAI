"use client";

import Link from "next/link";
import { formatAge, formatTimestamp, formatUsd } from "../lib/format";
import { useAlertHistory } from "../lib/alert-history";

function historyRule(row: { kind: string; threshold: number }) {
  if (row.kind === "change_24h") return `|24h| ≥ ${row.threshold}%`;
  return `${row.kind} ${formatUsd(row.threshold)}`;
}

function deliveryLabel(delivered: boolean) {
  return delivered
    ? "Webhook POST succeeded"
    : "In-app / this browser only — Telegram and Discord are not implemented";
}

export function AlertHistory() {
  const { items, clear } = useAlertHistory();
  return (
    <section className="card alerts-card" id="alert-history">
      <div className="section-heading">
        <div>
          <div className="eyebrow">FIRE HISTORY</div>
          <h2>Fires with timestamps — this browser</h2>
        </div>
        {items.length ? (
          <button type="button" className="ghost tool-button" onClick={() => clear()}>Clear history</button>
        ) : null}
      </div>
      <p className="muted alerts-note">
        Each row is a watchlist prefilter that actually matched, with the UTC time it landed. Optional webhook
        delivery is recorded only when the API actually POSTs — CoinVigil does not fake Telegram, Discord, or push.
      </p>
      {items.length === 0 ? (
        <div className="empty empty-panel">
          <strong>No fires yet</strong>
          <p>
            Save a price or 24h rule on a starred coin, then wait for the snapshot to match.
            Clearing history does not delete the rule. Demo snapshots never fire.
          </p>
        </div>
      ) : (
        <ul className="alerts-list">
          {items.map((row) => (
            <li key={row.id} data-history-coin={row.coinId}>
              <div className="alert-copy">
                <strong><Link href={`/asset/${row.coinId}`}>{row.name}</Link> <span className="muted">{historyRule(row)}</span></strong>
                <time className="alert-stamp" dateTime={row.at}>
                  {formatTimestamp(row.at) || row.at} · {formatAge(row.at)}
                </time>
                <span className="muted">{row.price != null ? formatUsd(row.price) : "quote unknown"}</span>
                <span className={`alert-delivery ${row.delivered ? "is-hook" : "is-local"}`}>{deliveryLabel(row.delivered)}</span>
                {row.note ? <span className="alert-note">{row.note.text}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
