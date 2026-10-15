import type { ResultSnapshot, WinMetric } from "@/lib/types";
import { WIN_METRICS } from "@/lib/types";
import { formatRate, numerator } from "@/lib/stats";

type Series = { label: string; snaps: ResultSnapshot[]; tone: "accent" | "muted" };

const STROKE: Record<Series["tone"], string> = { accent: "var(--accent)", muted: "var(--muted)" };

/**
 * Cumulative win-metric rate per recorded day, one line per arm. Cumulative (not daily) rates
 * are what the verdict compares, and they show whether the gap is opening or closing.
 * Server-rendered SVG: each point carries a native tooltip; a table view sits under <details>.
 */
export function RateTrend({ metric, series, height = 120 }: { metric: WinMetric; series: Series[]; height?: number }) {
  const label = WIN_METRICS.find((m) => m.id === metric)?.label ?? metric;
  const lines = series.map((s) => ({
    ...s,
    points: [...s.snaps]
      .sort((a, b) => a.date.localeCompare(b.date))
      .filter((p) => p.impressions > 0)
      .map((p) => ({ date: p.date, rate: numerator(metric, { ...p, updatedAt: "" }) / p.impressions, impressions: p.impressions })),
  }));
  const dates = [...new Set(lines.flatMap((l) => l.points.map((p) => p.date)))].sort();
  if (dates.length < 2) return null;
  const rates = lines.flatMap((l) => l.points.map((p) => p.rate));
  const max = Math.max(...rates, 0.0001) * 1.15;
  const W = 560;
  const H = height;
  const padL = 44;
  const padR = 56;
  const padT = 10;
  const padB = 22;
  const x = (d: string) => padL + (dates.indexOf(d) / (dates.length - 1)) * (W - padL - padR);
  const y = (r: number) => padT + (1 - r / max) * (H - padT - padB);
  const ticks = [0, max / 2, max].map((t) => Math.round(t * 10000) / 10000);
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

  return (
    <figure className="mt-2">
      <figcaption className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
        <span className="font-bold">{label}（累計）の推移</span>
        {lines.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1">
            <svg width="16" height="8" aria-hidden><line x1="0" y1="4" x2="16" y2="4" stroke={STROKE[l.tone]} strokeWidth="2" strokeDasharray={l.tone === "muted" ? "4 3" : undefined} /></svg>
            {l.label}
          </span>
        ))}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full max-w-xl" role="img" aria-label={`${label}の推移`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
            <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--muted)">{formatRate(t)}</text>
          </g>
        ))}
        <text x={padL} y={H - 6} fontSize="10" fill="var(--muted)">{md(dates[0])}</text>
        <text x={W - padR} y={H - 6} fontSize="10" fill="var(--muted)" textAnchor="end">{md(dates[dates.length - 1])}</text>
        {lines.map((l) => {
          if (!l.points.length) return null;
          const d = l.points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.rate).toFixed(1)}`).join(" ");
          const last = l.points[l.points.length - 1];
          return (
            <g key={l.label}>
              <path d={d} fill="none" stroke={STROKE[l.tone]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={l.tone === "muted" ? "4 3" : undefined} />
              {l.points.map((p) => (
                <circle key={p.date} cx={x(p.date)} cy={y(p.rate)} r={p === last ? 4 : 2.5} fill={STROKE[l.tone]} stroke="var(--surface)" strokeWidth="2">
                  <title>{`${l.label} ${p.date}: ${formatRate(p.rate)}（${p.impressions.toLocaleString()} 表示）`}</title>
                </circle>
              ))}
              {/* Hit targets larger than the marks for the native tooltip. */}
              {l.points.map((p) => (
                <circle key={`hit-${p.date}`} cx={x(p.date)} cy={y(p.rate)} r={10} fill="transparent">
                  <title>{`${l.label} ${p.date}: ${formatRate(p.rate)}（${p.impressions.toLocaleString()} 表示）`}</title>
                </circle>
              ))}
              <text x={x(last.date) + 8} y={y(last.rate) + 3} fontSize="10" fill="var(--fg)">{formatRate(last.rate)}</text>
            </g>
          );
        })}
      </svg>
      <details className="text-[11px] text-muted">
        <summary className="cursor-pointer">表で見る</summary>
        <table className="mt-1 tabular-nums">
          <thead>
            <tr><th className="pr-3 text-left font-bold">日付</th>{lines.map((l) => <th key={l.label} className="pr-3 text-right font-bold">{l.label}</th>)}</tr>
          </thead>
          <tbody>
            {dates.map((d) => (
              <tr key={d}>
                <td className="pr-3">{d}</td>
                {lines.map((l) => {
                  const p = l.points.find((q) => q.date === d);
                  return <td key={l.label} className="pr-3 text-right">{p ? `${formatRate(p.rate)}（${p.impressions.toLocaleString()}）` : "—"}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
