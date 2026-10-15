import Link from "next/link";
import type { Creative, Hypothesis } from "@/lib/types";
import { APPEAL_AXES, HYPOTHESIS_SOURCES, HYPOTHESIS_STATUS, appealLabel } from "@/lib/types";
import { addHypothesisAction, generateForHypothesisAction, setHypothesisStatusAction } from "@/lib/actions";
import { PendingButton } from "./PendingButton";

const STATUS_CLASS: Record<Hypothesis["status"], string> = {
  backlog: "border border-line text-muted",
  drafting: "bg-warn-soft text-warn",
  testing: "bg-accent-soft text-accent",
  concluded: "bg-bg text-muted border border-line",
  dropped: "bg-bg text-muted line-through",
};

/**
 * The hypothesis backlog: the unit of experimentation. Each entry becomes draft
 * creatives with one click, follows them through testing, and ends with an outcome.
 */
export function HypothesisBacklog({ briefId, hypotheses, creatives, suggested, hookStats = {} }: { briefId: string; hypotheses: Hypothesis[]; creatives: Creative[]; suggested: string[]; hookStats?: Record<string, { won: number; lost: number }> }) {
  const hookHint = (id: string) => {
    const st = hookStats[id];
    if (!st || st.won + st.lost === 0) return "";
    return `（勝率 ${Math.round((st.won / (st.won + st.lost)) * 100)}% / ${st.won + st.lost} 件）`;
  };
  const open = hypotheses.filter((h) => h.status !== "concluded" && h.status !== "dropped").sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt));
  const closed = hypotheses.filter((h) => h.status === "concluded" || h.status === "dropped").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const row = (h: Hypothesis) => {
    const cs = creatives.filter((c) => c.hypothesisId === h.id);
    const label = HYPOTHESIS_STATUS.find((s) => s.id === h.status)?.label;
    return (
      <li key={h.id} className="flex flex-col gap-2 rounded-md border border-line p-3 text-sm sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className={`chip ${h.priority === 1 ? "bg-danger-soft text-danger" : h.priority === 2 ? "bg-warn-soft text-warn" : "border border-line text-muted"}`}>優先 {h.priority}</span>
            <span className={`chip ${STATUS_CLASS[h.status]}`}>{label}{h.outcome ? `・${h.outcome === "won" ? "勝ち" : h.outcome === "lost" ? "負け" : "結論なし"}` : ""}</span>
            <span className="chip bg-accent-soft text-accent">{appealLabel(h.hook)}</span>
            <span className="text-muted">{HYPOTHESIS_SOURCES.find((s) => s.id === h.source)?.label} ・ {h.author}</span>
          </div>
          <div className="mt-1 font-bold">{h.title}</div>
          {h.rationale && <div className="text-xs text-muted">{h.rationale}</div>}
          {cs.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
              {cs.map((c) => (
                <Link key={c.id} href={`/creatives/${c.id}`} className="chip border border-line text-muted hover:underline">
                  {c.slots.headline.slice(0, 18)}{c.slots.headline.length > 18 ? "…" : ""}
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {(h.status === "backlog" || h.status === "drafting") && (
            <form action={generateForHypothesisAction}>
              <input type="hidden" name="hypothesisId" value={h.id} />
              <PendingButton pendingText="生成中…" className="btn-primary py-1 text-xs">{cs.length ? "案を追加生成" : "この仮説で案を作る"}</PendingButton>
            </form>
          )}
          {h.status !== "concluded" && h.status !== "dropped" && (
            <form action={setHypothesisStatusAction}>
              <input type="hidden" name="hypothesisId" value={h.id} />
              <input type="hidden" name="status" value="dropped" />
              <button type="submit" className="btn-ghost py-1 text-xs">見送る</button>
            </form>
          )}
          {h.status === "dropped" && (
            <form action={setHypothesisStatusAction}>
              <input type="hidden" name="hypothesisId" value={h.id} />
              <input type="hidden" name="status" value="backlog" />
              <button type="submit" className="btn-ghost py-1 text-xs">戻す</button>
            </form>
          )}
        </div>
      </li>
    );
  };

  return (
    <section className="card flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-black">仮説バックログ（{open.length}）</h2>
          <p className="text-xs text-muted">実験の単位は仮説です。優先 1 から順に案にし、結論が出たら次へ。1 案件で比較する仮説の数が検証速度を決めます。</p>
        </div>
      </div>
      {open.length === 0 ? (
        <p className="rounded-md border border-dashed border-line p-4 text-center text-sm text-muted">未着手の仮説がありません。下のフォームから追加してください。</p>
      ) : (
        <ul className="flex flex-col gap-2">{open.map(row)}</ul>
      )}
      {closed.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-bold text-muted">結論済み・見送り（{closed.length}）</summary>
          <ul className="mt-2 flex flex-col gap-2">{closed.map(row)}</ul>
        </details>
      )}
      <form action={addHypothesisAction} className="flex flex-col gap-2 rounded-md bg-bg p-3">
        <input type="hidden" name="briefId" value={briefId} />
        <div className="text-xs font-bold text-muted">仮説を追加</div>
        <input name="title" required className="input text-sm" placeholder="例: 招待状型は様子見で離脱する層のタップ率を上げる" list={`suggest-${briefId}`} />
        {suggested.length > 0 && (
          <datalist id={`suggest-${briefId}`}>
            {suggested.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
        <input name="rationale" className="input text-xs" placeholder="根拠（任意）: 学びログ・過去の勝ち型・クライアントの要望など" />
        <div className="grid gap-2 sm:grid-cols-4">
          <select name="hook" className="input text-xs" defaultValue="compatibility">
            {APPEAL_AXES.map((a) => (
              <option key={a.id} value={a.id}>{a.label}{hookHint(a.id)}</option>
            ))}
          </select>
          <select name="priority" className="input text-xs" defaultValue="2">
            <option value="1">優先 1（次に試す）</option>
            <option value="2">優先 2</option>
            <option value="3">優先 3</option>
          </select>
          <select name="source" className="input text-xs" defaultValue="ap">
            {HYPOTHESIS_SOURCES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <input name="author" className="input text-xs" placeholder="記入者" />
            <PendingButton pendingText="追加中…" className="btn-ghost py-1 text-xs">追加</PendingButton>
          </div>
        </div>
      </form>
    </section>
  );
}
