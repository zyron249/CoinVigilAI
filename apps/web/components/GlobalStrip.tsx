import type { GlobalOverview } from "../lib/api";
import { changeClass, formatCompactUsd, formatPercent } from "../lib/format";
import { StatusBadge } from "./StatusBadge";

export function GlobalStrip({ overview }: { overview: GlobalOverview }) {
  const universeNote = overview.note || "Ranked universe total, not CoinGecko /global";
  const items = [
    {
      label: "Market cap",
      value: formatCompactUsd(overview.total_market_cap_usd),
      extra: overview.coverage === "global" ? formatPercent(overview.market_cap_change_percentage_24h_usd) : null,
      extraClass: changeClass(overview.market_cap_change_percentage_24h_usd),
      note: overview.coverage === "global" ? undefined : universeNote,
    },
    { label: "24h volume", value: formatCompactUsd(overview.total_volume_24h_usd) },
    {
      label: "BTC dominance",
      value: overview.btc_dominance != null ? `${overview.btc_dominance.toFixed(1)}%` : "—",
    },
    {
      label: "ETH dominance",
      value: overview.eth_dominance != null ? `${overview.eth_dominance.toFixed(1)}%` : "—",
    },
    {
      label: "Fear & Greed",
      value: overview.fear_greed_value != null
        ? `${overview.fear_greed_value} · ${overview.fear_greed_classification}`
        : "Unavailable",
      note: overview.fear_greed_source ? `via ${overview.fear_greed_source}` : "Hidden when the source is down — never invented",
    },
  ];

  return (
    <section className="global-strip" aria-label="Global market summary">
      {items.map((item) => (
        <div className="global-stat" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          {"extra" in item && item.extra && item.extra !== "—" ? (
            <em className={"extraClass" in item ? item.extraClass : undefined}>{item.extra} 24h</em>
          ) : item.note ? (
            <em>{item.note}</em>
          ) : null}
        </div>
      ))}
      <div className="global-stat source-stat">
        <span>Data source</span>
        <strong><StatusBadge source={overview.source} /></strong>
        <em>{overview.coverage === "global" ? "CoinGecko global" : universeNote}</em>
      </div>
    </section>
  );
}
