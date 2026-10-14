import Link from "next/link";
import type { Learning } from "@/lib/types";

const OUTCOME: Record<Learning["outcome"], [string, string]> = {
  won: ["勝ち", "bg-accent-soft text-accent"],
  lost: ["負け", "bg-danger-soft text-danger"],
  inconclusive: ["結論なし", "border border-line text-muted"],
  note: ["メモ", "bg-bg border border-line text-muted"],
};

export function LearningLog({ items, showBrief }: { items: Learning[]; showBrief?: Map<string, string> }) {
  if (items.length === 0) return <p className="text-sm text-muted">まだ学びはありません。挑戦者の結論を出すと自動で記録されます。</p>;
  return (
    <ol className="flex flex-col gap-2">
      {items.map((l) => {
        const [label, cls] = OUTCOME[l.outcome];
        return (
          <li key={l.id} className="rounded-md border border-line p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`chip ${cls}`}>{label}</span>
              {showBrief && (
                <Link href={`/briefs/${l.briefId}`} className="font-bold hover:underline">
                  {showBrief.get(l.briefId) ?? l.briefId}
                </Link>
              )}
              <span className="text-muted">{new Date(l.createdAt).toLocaleDateString("ja-JP")}</span>
              <span className="text-muted">{l.author}</span>
            </div>
            <div className="mt-1 font-bold">{l.hypothesis}</div>
            {l.evidence && <div className="text-xs text-muted">根拠: {l.evidence}</div>}
            {l.nextHypothesis && <div className="mt-1 text-xs"><span className="font-bold text-accent">次 →</span> {l.nextHypothesis}</div>}
          </li>
        );
      })}
    </ol>
  );
}
