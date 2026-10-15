import type { LibraryEntry } from "@/lib/library";
import { LIBRARY_META } from "@/lib/library";
import { appealLabel } from "@/lib/types";

const STRUCTURE: Record<string, string> = { two_buttons: "2ボタン", single_cta: "CTA 1本", multi_choice: "多択", no_button_detected: "—" };

/** Past popups close to this brief, from the OCR'd reference library. Text only; no client images are shown. */
export function SimilarCases({ entries }: { entries: LibraryEntry[] }) {
  return (
    <section className="card flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-black">過去の類似案（参考）</h2>
        <span className="text-[11px] text-muted">過去ポップアップ {LIBRARY_META.count} 件の OCR 抽出。誤字を含むことがあります</span>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-muted">近い業種・フックの過去案が見つかりませんでした。</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {entries.map((e) => (
            <li key={e.id} className="rounded-md border border-line p-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted">
                <span className="font-bold text-ink">{e.client}</span>
                <span className="chip border border-line">{e.industry}</span>
                {e.hook !== "other" && <span className="chip bg-accent-soft text-accent">{appealLabel(e.hook)}</span>}
                <span className="chip border border-line">{STRUCTURE[e.structure] ?? e.structure}</span>
                {e.animated && <span className="chip bg-warn-soft text-warn">GIF</span>}
              </div>
              {e.eyebrow && <div className="mt-1 text-[11px] text-muted">帯: {e.eyebrow}</div>}
              <div className="mt-0.5 font-bold leading-snug">{e.headline}</div>
              <div className="mt-1 text-[11px] text-muted">
                {e.options?.length ? `選択肢: ${e.options.join(" / ")}` : `${e.negative ?? "—"} / ${e.positive ?? "—"}`}
                {e.badges[0] ? ` ・ バッジ: ${e.badges[0]}` : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
