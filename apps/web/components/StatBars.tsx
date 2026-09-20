export function RangeBar({
  low,
  high,
  current,
}: {
  low?: number | null;
  high?: number | null;
  current?: number | null;
}) {
  if (low == null || high == null || high <= low) {
    return <span className="muted">—</span>;
  }
  const pct = current == null ? 50 : Math.min(100, Math.max(0, ((current - low) / (high - low)) * 100));
  return (
    <div className="range-bar" aria-label="24 hour price range">
      <i style={{ left: `${pct}%` }} />
    </div>
  );
}

export function SupplyBar({
  circulating,
  max,
}: {
  circulating?: number | null;
  max?: number | null;
}) {
  if (circulating == null || max == null || max <= 0) return null;
  const pct = Math.min(100, Math.max(0, (circulating / max) * 100));
  return (
    <div className="range-bar supply-bar" aria-label="Circulating supply versus max">
      <b style={{ width: `${pct}%` }} />
    </div>
  );
}
