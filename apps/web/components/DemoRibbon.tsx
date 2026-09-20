import { sourceLabel } from "../lib/format";

export function DemoRibbon({ source }: { source?: string }) {
  const info = sourceLabel(source);
  if (info.tone === "demo") {
    return (
      <div className="source-ribbon demo-ribbon" role="status">
        <strong>Demo snapshot.</strong>
        <span> These prices are synthetic stand-ins used only because CoinGecko is unreachable. They are not live markets. Not financial advice.</span>
      </div>
    );
  }
  if (info.tone === "down") {
    return (
      <div className="source-ribbon down-ribbon" role="status">
        <strong>Market data unavailable.</strong>
        <span> CoinVigil does not invent prices when CoinGecko cannot be reached.</span>
      </div>
    );
  }
  return null;
}
