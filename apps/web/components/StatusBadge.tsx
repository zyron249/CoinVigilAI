import { sourceLabel } from "../lib/format";

export function StatusBadge({ source, stale }: { source?: string; stale?: boolean }) {
  const info = sourceLabel(source, { stale });
  return (
    <span className={`status-badge tone-${info.tone}`} title={`Market source: ${source || "none"}`}>
      {info.text}
    </span>
  );
}
