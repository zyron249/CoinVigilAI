import { sourceLabel } from "../lib/format";

export function StatusBadge({ source }: { source?: string }) {
  const info = sourceLabel(source);
  return (
    <span className={`status-badge tone-${info.tone}`} title={`Market source: ${source || "none"}`}>
      {info.text}
    </span>
  );
}
