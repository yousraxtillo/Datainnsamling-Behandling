"use client";

interface Slice {
  label: string;
  value: number;
}

const COLORS = [
  "#2563eb", // blue-600
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#ec4899", // pink-500
  "#8b5cf6", // violet-500
  "#f97316", // orange-500
];

interface Props {
  slices: Slice[];
  emptyLabel?: string;
}

export function PieChart({ slices, emptyLabel = "Ingen data" }: Props) {
  const filtered = slices.filter((slice) => slice.value > 0);
  const data = filtered.length ? filtered : [];
  const total = data.reduce((acc, slice) => acc + slice.value, 0);

  if (!total) {
    return (
      <div className="flex h-40 w-40 items-center justify-center rounded-full border border-border/60 bg-card/40 text-xs text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  let currentAngle = 0;
  const segments: string[] = [];
  const legend = data.map((slice, index) => {
    const color = COLORS[index % COLORS.length];
    const start = currentAngle;
    const sweep = (slice.value / total) * 360;
    currentAngle += sweep;
    segments.push(`${color} ${start}deg ${start + sweep}deg`);
    return { ...slice, color, percentage: (slice.value / total) * 100 };
  });

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-40 w-40">
        <div
          className="absolute inset-0 rounded-full shadow-inner"
          style={{ background: `conic-gradient(${segments.join(",")})` }}
        />
        <div className="absolute inset-8 rounded-full bg-card/90" />
      </div>
      <ul className="space-y-2 text-xs">
        {legend.map((entry) => (
          <li key={entry.label} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="truncate">{entry.label}</span>
            <span className="text-muted-foreground">
              {entry.percentage.toFixed(entry.percentage >= 10 ? 1 : 2).replace(/\.0+$/, "")}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

