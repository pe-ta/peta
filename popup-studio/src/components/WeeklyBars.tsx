import type { WeekBucket } from "@/lib/northstar";

/**
 * Hypotheses concluded per week (single series, one bar per week). The current week is
 * the last bar and is drawn lighter because it is still in progress. Each bar has a
 * native tooltip with the won / lost / no-difference split; a table sits under <details>.
 */
export function WeeklyBars({ weeks, target }: { weeks: WeekBucket[]; target?: number | null }) {
  const W = 480;
  const H = 110;
  const padB = 16;
  const padT = 18;
  const max = Math.max(1, ...weeks.map((w) => w.total), target ?? 0);
  const bw = W / weeks.length;
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[480px]" role="img" aria-label="週ごとの結論数">
        <line x1="0" x2={W} y1={H - padB} y2={H - padB} stroke="var(--line)" />
        {target ? (
          <g>
            <line x1="0" x2={W} y1={y(target)} y2={y(target)} stroke="var(--muted)" strokeDasharray="3 3" />
            <text x={W - 2} y={y(target) - 3} fontSize="10" textAnchor="end" fill="var(--muted)">{`目標 ${target}`}</text>
          </g>
        ) : null}
        {weeks.map((w, i) => {
          const current = i === weeks.length - 1;
          const x = i * bw + bw * 0.2;
          const top = y(w.total);
          const h = Math.max(0, H - padB - top);
          return (
            <g key={w.start}>
              {h > 0 && <rect x={x} y={top} width={bw * 0.6} height={h} rx="3" fill="var(--accent)" opacity={current ? 0.45 : 1} />}
              <rect x={i * bw} y={0} width={bw} height={H} fill="transparent">
                <title>{`${w.start} の週${current ? "（進行中）" : ""}: ${w.total} 件（勝ち ${w.won} / 負け ${w.lost} / 差なし ${w.inconclusive}）`}</title>
              </rect>
              {(i === 0 || current || i === Math.floor(weeks.length / 2)) && (
                <text x={i * bw + bw / 2} y={H - 3} fontSize="10" textAnchor="middle" fill="var(--muted)">{current ? "今週" : md(w.start)}</text>
              )}
              {w.total > 0 && <text x={i * bw + bw / 2} y={top - 2} fontSize="10" textAnchor="middle" fill="var(--fg)">{w.total}</text>}
            </g>
          );
        })}
      </svg>
      <details className="text-[11px] text-muted">
        <summary className="cursor-pointer">表で見る</summary>
        <table className="mt-1 tabular-nums">
          <tbody>
            {weeks.map((w) => (
              <tr key={w.start}>
                <td className="pr-3">{w.start}〜</td>
                <td className="pr-3 text-right font-bold">{w.total}</td>
                <td className="pr-3">勝ち {w.won} / 負け {w.lost} / 差なし {w.inconclusive}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
