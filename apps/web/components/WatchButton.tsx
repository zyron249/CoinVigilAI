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
  const { ids, toggle } = useWatchlist();
  const watched = ids.has(id.toLowerCase());
  const label = watched ? `Remove ${name} from watchlist` : `Save ${name} to this browser watchlist`;

  return (
    <button
      type="button"
      className={`watch-button ${compact ? "compact" : ""} ${watched ? "is-on" : ""}`}
      aria-pressed={watched}
      aria-label={label}
      title={watched ? "Saved in this browser" : "Save in this browser — no account"}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggle({ id, symbol, name });
      }}
    >
      <span aria-hidden="true">{watched ? "★" : "☆"}</span>
      {compact ? null : <span>{watched ? "Watching" : "Watch"}</span>}
    </button>
  );
}
