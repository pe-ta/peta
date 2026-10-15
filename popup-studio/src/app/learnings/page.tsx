import Link from "next/link";
import { db } from "@/lib/store";
import { APPEAL_AXES, MOTIONS, VISUAL_AXES, appealLabel, type Learning } from "@/lib/types";
import { STRUCTURE_LABEL } from "@/lib/dna";
import { LearningLog } from "@/components/LearningLog";
import { TEMPLATES } from "@/lib/templates";

export const dynamic = "force-dynamic";

interface Bucket {
  key: string;
  label: string;
  tested: number;
  won: number;
  lost: number;
}

function tally(items: Learning[], pick: (l: Learning) => Array<[string, string]>): Bucket[] {
  const m = new Map<string, Bucket>();
  for (const l of items) {
    if (!l.dna || l.outcome === "note") continue;
    for (const [key, label] of pick(l)) {
      const b = m.get(key) ?? { key, label, tested: 0, won: 0, lost: 0 };
      b.tested++;
      if (l.outcome === "won") b.won++;
      if (l.outcome === "lost") b.lost++;
      m.set(key, b);
    }
  }
  return [...m.values()].sort((a, b) => b.tested - a.tested);
}

function Table({ title, rows, hint }: { title: string; rows: Bucket[]; hint?: string }) {
  return (
    <div className="card p-4">
      <h2 className="text-sm font-black">{title}</h2>
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-muted">まだ結論の出た実験がありません。</p>
      ) : (
        <table className="mt-2 w-full text-xs tabular-nums">
          <thead className="text-muted">
            <tr><th className="text-left font-bold">軸</th><th className="text-right font-bold">検証</th><th className="text-right font-bold">勝ち</th><th className="text-right font-bold">負け</th><th className="text-right font-bold">勝率</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const rate = r.won + r.lost > 0 ? r.won / (r.won + r.lost) : null;
              return (
                <tr key={r.key} className="border-t border-line">
                  <td className="py-1 font-bold">{r.label}</td>
                  <td className="text-right">{r.tested}</td>
                  <td className="text-right text-accent">{r.won}</td>
                  <td className="text-right text-danger">{r.lost}</td>
                  <td className="text-right font-black">{rate === null ? "—" : `${Math.round(rate * 100)}%`}{r.won + r.lost < 5 && rate !== null ? <span className="ml-1 font-normal text-muted">(n小)</span> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Cross-client learning library: win rates by DNA axis, plus the full log. */
export default async function LearningsPage() {
  const learnings = (await db.learnings.list()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const briefs = await db.briefs.list();
  const names = new Map(briefs.map((b) => [b.id, b.clientName]));
  const industries = new Map(briefs.map((b) => [b.id, b.industry]));
  const concluded = learnings.filter((l) => l.outcome !== "note");

  const byHook = tally(learnings, (l) => [[l.dna!.hook, appealLabel(l.dna!.hook)]]);
  const byStructure = tally(learnings, (l) => [[l.dna!.structure, STRUCTURE_LABEL[l.dna!.structure]]]);
  const byLayout = tally(learnings, (l) => [[l.dna!.layout, TEMPLATES.find((t) => t.id === l.dna!.layout)?.name ?? l.dna!.layout]]);
  const byVisual = tally(learnings, (l) => [[l.dna!.visual, VISUAL_AXES.find((v) => v.id === l.dna!.visual)?.label ?? l.dna!.visual]]);
  const byMotion = tally(learnings, (l) => [[l.dna!.motion, MOTIONS.find((m) => m.id === l.dna!.motion)?.label ?? l.dna!.motion]]);
  const byTag = tally(learnings, (l) => l.dna!.tags.map((t) => [t, t] as [string, string]));
  const byIndustry = tally(learnings, (l) => [[industries.get(l.briefId) ?? "?", industries.get(l.briefId) ?? "不明"]]);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="text-xs font-bold text-accent">学びライブラリ</div>
        <h1 className="text-2xl font-black tracking-tight">何が勝ってきたか（全クライアント）</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          結論の出た実験 {concluded.length} 件を DNA タグで集計。勝率は「勝ち ÷（勝ち + 負け）」。検証数が 5 未満の行は参考値です。新しい仮説を立てるときは、勝率が高い軸を起点に、未検証の軸を組み合わせてください。
        </p>
        <p className="mt-1 text-xs text-muted">フック一覧: {APPEAL_AXES.map((a) => a.label).join("、")}</p>
      </section>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Table title="フック別" rows={byHook} />
        <Table title="構造別" rows={byStructure} />
        <Table title="レイアウト別" rows={byLayout} />
        <Table title="ビジュアル別" rows={byVisual} />
        <Table title="動き別" rows={byMotion} />
        <Table title="業種別" rows={byIndustry} />
        <Table title="説得戦略タグ別" rows={byTag} hint="1 案に複数のタグが付くため、合計は実験数を超えます" />
      </section>
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-black">学びログ（新しい順）</h2>
          <Link href="/" className="text-xs text-muted hover:underline">実験ボードへ</Link>
        </div>
        <LearningLog items={learnings} showBrief={names} />
      </section>
    </div>
  );
}
