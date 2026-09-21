import type { MarketAsset } from "../lib/api";
import { changeClass, formatPercent, formatTimestamp, formatUsd, sourceLabel } from "../lib/format";
import { StatusBadge } from "./StatusBadge";

export function TapeBar({
  source,
  stale,
  fallbackReason,
  lastLiveAt,
  asOf,
  bitcoin,
}: {
  source?: string;
  stale?: boolean;
  fallbackReason?: string | null;
  lastLiveAt?: string | null;
  asOf?: string | null;
  bitcoin?: MarketAsset | null;
}) {
  const info = sourceLabel(source, { stale, fallbackReason });
  const lastLive = formatTimestamp(lastLiveAt);
  const updated = formatTimestamp(asOf);
  const stamp = stale && lastLive
    ? `Last live ${lastLive}`
    : updated
      ? `Last updated ${updated}`
      : lastLive
        ? `Last live ${lastLive}`
        : "Last updated: waiting for a snapshot";

  return (
    <div className={`tape-bar tone-${info.tone}`} role="status">
      <StatusBadge source={source} stale={stale} fallbackReason={fallbackReason} />
      {bitcoin ? (
        <strong>
          BTC {formatUsd(bitcoin.current_price)}{" "}
          <span className={changeClass(bitcoin.price_change_percentage_24h)}>
            {formatPercent(bitcoin.price_change_percentage_24h)}
          </span>
        </strong>
      ) : (
        <strong>Tape</strong>
      )}
      <span className="muted">{stamp}</span>
      {fallbackReason === "rate_limited" ? <span className="muted">CoinGecko rate-limited</span> : null}
      {info.demo ? <span className="muted">Synthetic stand-ins — not live markets</span> : null}
    </div>
  );
}
