import type { Critique } from "@/lib/types";
import { CRITIQUE_AXES } from "@/lib/critique";

function tone(n: number) {
  return n >= 70 ? "text-accent" : n >= 50 ? "text-warn" : "text-danger";
}
function bar(n: number) {
  return n >= 70 ? "bg-accent" : n >= 50 ? "bg-warn" : "bg-danger";
}

export function CritiquePanel({ critique, compact }: { critique: Critique; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-black">辛口分析</h3>
            <span className="chip border border-line text-muted">{critique.source === "ai" ? "AI" : "ルール判定"}</span>
          </div>
          <p className={`mt-1 text-sm font-bold ${tone(critique.overall)}`}>{critique.verdict}</p>
        </div>
        <div className={`text-3xl font-black tabular-nums ${tone(critique.overall)}`}>
          {critique.overall}
          <span className="ml-0.5 text-xs font-bold text-muted">/100</span>
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {CRITIQUE_AXES.map((a) => {
          const v = critique.scores[a.key];
          return (
            <li key={a.key} className="text-xs" title={a.hint}>
              <div className="flex items-center justify-between">
                <span className="font-bold">{a.label}</span>
                <span className={`tabular-nums font-black ${tone(v)}`}>{v}</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-line">
                <div className={`h-full ${bar(v)}`} style={{ width: `${v}%` }} />
              </div>
            </li>
          );
        })}
      </ul>

      {!compact && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-danger/30 bg-danger-soft/40 p-3">
            <div className="text-xs font-black text-danger">ダメな理由</div>
            <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-xs">
              {critique.problems.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-md border border-accent/30 bg-accent-soft/50 p-3">
            <div className="text-xs font-black text-accent">直し方</div>
            <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-xs">
              {critique.fixes.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {critique.vsChampion && (
        <div className={`rounded-md p-3 text-xs ${critique.vsChampion.challengerWins ? "bg-accent-soft text-accent" : "bg-bg text-muted border border-line"}`}>
          <span className="font-black">対チャンピオン予測: {critique.vsChampion.challengerWins ? "勝つ" : "負ける"}</span>
          <span className="ml-2 tabular-nums">確信度 {(critique.vsChampion.confidence * 100).toFixed(0)}%</span>
          <span className="ml-2">{critique.vsChampion.reason}</span>
        </div>
      )}
      <div className="text-[11px] text-muted">
        予測は参考値です。配信実績との一致率（Kendall τ）を計測し、相関が確認できるまで判定には使いません。{new Date(critique.createdAt).toLocaleString("ja-JP")}
      </div>
    </div>
  );
}
