import { sourceLabel } from "../lib/format";

export function StatusBadge({
  source,
  stale,
  fallbackReason,
}: {
  source?: string;
  stale?: boolean;
  fallbackReason?: string | null;
}) {
  const info = sourceLabel(source, { stale, fallbackReason });
  return (
    <span className={`status-badge tone-${info.tone}`} title={`Market source: ${source || "none"}`}>
      {info.text}
    </span>
  );
}
