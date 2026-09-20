import { formatTimestamp, sourceLabel } from "../lib/format";

function reasonCopy(reason?: string | null) {
  if (reason === "rate_limited") return "CoinGecko rate-limited this request.";
  if (reason === "unreachable") return "CoinGecko could not be reached.";
  return "Live CoinGecko data is temporarily unavailable.";
}

export function DemoRibbon({
  source,
  lastLiveAt,
  stale,
  fallbackReason,
}: {
  source?: string;
  lastLiveAt?: string | null;
  stale?: boolean;
  fallbackReason?: string | null;
}) {
  const info = sourceLabel(source, { stale });
  const lastLive = formatTimestamp(lastLiveAt);

  if (stale || (info.tone === "cache" && fallbackReason)) {
    return (
      <div className="source-ribbon cache-ribbon" role="status">
        <strong>Showing last live snapshot.</strong>
        <span>
          {" "}{reasonCopy(fallbackReason)}
          {lastLive ? ` Last live CoinGecko data: ${lastLive}.` : " No later live timestamp is stored."}
          {" "}Prices may have moved. Not financial advice.
        </span>
      </div>
    );
  }

  if (info.tone === "demo") {
    return (
      <div className="source-ribbon demo-ribbon" role="status">
        <strong>Demo snapshot.</strong>
        <span>
          {" "}{reasonCopy(fallbackReason)} These prices are synthetic stand-ins, not live markets.
          {lastLive ? ` Last live CoinGecko data was ${lastLive}.` : ""}
          {" "}Not financial advice.
        </span>
      </div>
    );
  }

  if (info.tone === "down") {
    return (
      <div className="source-ribbon down-ribbon" role="status">
        <strong>Market data unavailable.</strong>
        <span>
          {" "}{reasonCopy(fallbackReason)} CoinVigil does not invent prices when CoinGecko cannot be reached.
          {lastLive ? ` Last live CoinGecko data was ${lastLive}.` : ""}
        </span>
      </div>
    );
  }

  return null;
}
