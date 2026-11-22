// Lightweight SVG charts (no runtime dependency; theme-aware through CSS variables).

export function BarChart({ data, height = 140, unit = "", color = "var(--accent)", goal }: { data: { label: string; value: number }[]; height?: number; unit?: string; color?: string; goal?: number }) {
  const w = 320;
  const pad = { t: 16, b: 22, l: 4, r: 4 };
  const max = Math.max(1, goal ?? 0, ...data.map((d) => d.value));
  const bw = (w - pad.l - pad.r) / Math.max(1, data.length);
  const ih = height - pad.t - pad.b;
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} role="img" aria-label="Bar chart">
      {goal !== undefined && goal > 0 && <line x1={pad.l} x2={w - pad.r} y1={y(goal)} y2={y(goal)} stroke="var(--text-3)" strokeDasharray="4 4" strokeWidth={1} />}
      {data.map((d, i) => {
        const h = Math.max(d.value > 0 ? 3 : 0, (d.value / max) * ih);
        const x = pad.l + i * bw + bw * 0.18;
        return (
          <g key={i}>
            <rect x={x} y={pad.t + ih - h} width={bw * 0.64} height={h} rx={4} fill={color} opacity={d.value > 0 ? 1 : 0.25}>
              <title>{`${d.label}: ${Math.round(d.value * 10) / 10}${unit}`}</title>
            </rect>
            {d.value > 0 && data.length <= 14 && (
              <text x={x + bw * 0.32} y={pad.t + ih - h - 4} textAnchor="middle" className="chart-label">
                {Math.round(d.value)}
              </text>
            )}
            <text x={x + bw * 0.32} y={height - 6} textAnchor="middle" className="chart-label">
              {d.label}
            </text>
          </g>
        );
      })}
      <rect x={pad.l} y={pad.t + ih} width={w - pad.l - pad.r} height={1} fill="var(--border)" />
    </svg>
  );
}

export function LineChart({ data, height = 150, unit = "", color = "var(--accent)" }: { data: { label: string; value: number }[]; height?: number; unit?: string; color?: string }) {
  if (data.length < 2)
    return (
      <div className="empty" style={{ padding: 16 }}>
        <small>Add at least two entries to see a trend.</small>
      </div>
    );
  const w = 320;
  const pad = { t: 18, b: 22, l: 8, r: 8 };
  const vals = data.map((d) => d.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const x = (i: number) => pad.l + (i / (data.length - 1)) * (w - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / span) * (height - pad.t - pad.b);
  const path = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const step = Math.ceil(data.length / 6);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} role="img" aria-label="Line chart">
      <path d={`${path} L${x(data.length - 1)},${height - pad.b} L${x(0)},${height - pad.b} Z`} fill={color} opacity={0.1} />
      <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(d.value)} r={3.5} fill="var(--surface)" stroke={color} strokeWidth={2}>
            <title>{`${d.label}: ${d.value}${unit}`}</title>
          </circle>
          {(i % step === 0 || i === data.length - 1) && (
            <text x={x(i)} y={height - 6} textAnchor="middle" className="chart-label">
              {d.label}
            </text>
          )}
        </g>
      ))}
      <text x={w - pad.r} y={12} textAnchor="end" className="chart-label">
        {`${Math.round(hi * 10) / 10}${unit} max · ${Math.round(lo * 10) / 10}${unit} min`}
      </text>
    </svg>
  );
}
