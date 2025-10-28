"use client";

interface Point {
  date: string;
  value: number;
}

interface Props {
  points: Point[];
}

export function LineChart({ points }: Props) {
  if (!points.length) {
    return <div className="rounded-lg border border-border/60 p-6 text-center text-sm text-muted-foreground">Ingen historikk</div>;
  }

  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const values = sorted.map((point) => point.value);
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const valueRange = maxValue - minValue || 1;

  const paddingX = 16;
  const paddingY = 12;
  const width = 480;
  const height = 180;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;

  const path = sorted
    .map((point, idx) => {
      const x = paddingX + (idx / Math.max(sorted.length - 1, 1)) * chartWidth;
      const y = paddingY + chartHeight - ((point.value - minValue) / valueRange) * chartHeight;
      return `${idx === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");

  const area = path
    ? `${path} L${paddingX + chartWidth},${paddingY + chartHeight} L${paddingX},${paddingY + chartHeight} Z`
    : "";

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="w-full">
      <defs>
        <linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(59,130,246,0.35)" />
          <stop offset="100%" stopColor="rgba(59,130,246,0.05)" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={width} height={height} fill="transparent" />
      {area && <path d={area} fill="url(#chart-fill)" />}
      <path d={path} fill="none" stroke="rgba(59,130,246,0.8)" strokeWidth={2} strokeLinecap="round" />
      {sorted.map((point, idx) => {
        const x = paddingX + (idx / Math.max(sorted.length - 1, 1)) * chartWidth;
        const y = paddingY + chartHeight - ((point.value - minValue) / valueRange) * chartHeight;
        return <circle key={point.date} cx={x} cy={y} r={3} fill="rgba(59,130,246,0.9)" />;
      })}
    </svg>
  );
}
