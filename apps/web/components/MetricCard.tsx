type Props = {
  label: string;
  value: string;
  note?: string;
};

export function MetricCard({ label, value, note }: Props) {
  return (
    <div className="card metric-card">
      <div className="eyebrow">{label}</div>
      <div className="metric-value">{value}</div>
      {note ? <div className="muted">{note}</div> : null}
    </div>
  );
}
