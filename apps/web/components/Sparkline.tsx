import { memo } from "react";

type Props = {
  values?: number[] | null;
  width?: number;
  height?: number;
};

function SparklineInner({ values, width = 108, height = 32 }: Props) {
  if (!values || values.length < 2) {
    return <span className="muted">—</span>;
  }

  const sample = values.length > 80
    ? values.filter((_, index) => index % Math.ceil(values.length / 80) === 0 || index === values.length - 1)
    : values;
  const min = Math.min(...sample);
  const max = Math.max(...sample);
  const range = max - min || 1;
  const points = sample.map((value, index) => {
    const x = (index / Math.max(sample.length - 1, 1)) * width;
    const y = height - ((value - min) / range) * (height - 4) - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  const up = sample[sample.length - 1] >= sample[0];

  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={up ? "var(--accent)" : "var(--danger)"}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export const Sparkline = memo(SparklineInner, (prev, next) => (
  prev.width === next.width
  && prev.height === next.height
  && (prev.values || []).join("\0") === (next.values || []).join("\0")
));
