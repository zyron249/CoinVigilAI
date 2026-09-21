"use client";

import { useWatchlist } from "../lib/watchlist";

export function WatchButton({
  id,
  symbol,
  name,
  compact = false,
}: {
  id: string;
  symbol: string;
  name: string;
  compact?: boolean;
}) {
  const { ids, toggle, atCap, cap, premium } = useWatchlist();
  const watched = ids.has(id.toLowerCase());
  const blocked = atCap && !watched;
  const label = watched
    ? `Remove ${name} from watchlist`
    : blocked
      ? `Free watchlist is full (${cap} coins). Local premium toggle raises the cap — not a payment.`
      : `Save ${name} to this browser watchlist`;

  function activate(event: { preventDefault: () => void; stopPropagation: () => void }) {
    event.preventDefault();
    event.stopPropagation();
    toggle({ id, symbol, name });
  }

  return (
    <button
      type="button"
      className={`watch-button ${compact ? "compact" : ""} ${watched ? "is-on" : ""} ${blocked ? "is-blocked" : ""}`}
      aria-pressed={watched}
      aria-disabled={blocked || undefined}
      aria-label={label}
      title={label}
      data-blocked={blocked ? "free-cap" : undefined}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          activate(event);
        }
      }}
    >
      <span aria-hidden="true">{watched ? "★" : "☆"}</span>
      {compact ? null : <span>{watched ? "Watching" : blocked ? (premium ? "Cap reached" : "Free cap") : "Watch"}</span>}
    </button>
  );
}
