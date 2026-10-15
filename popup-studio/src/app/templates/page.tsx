/* eslint-disable @next/next/no-img-element */
import { TEMPLATES, SPECS } from "@/lib/templates";
import { APPEAL_AXES, MOTIONS, appealLabel } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Master template gallery. Templates are code owned by the design team: this page
 * shows what exists, which hooks each one serves, and how a new one is added.
 */
export default function TemplatesPage() {
  const spec = SPECS.sp;
  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="text-xs font-bold text-accent">マスターテンプレート</div>
        <h1 className="text-2xl font-black tracking-tight">デザインチームの型（{TEMPLATES.length} 種）</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          案はすべてこの型に文言を流し込んで作られます。型は過去 1,066 枚の実績構造（帯 → 質問見出し → ビジュアル → 小バッジ → ボタン対）に沿ってコードで定義され、デザインチームが追加・改訂します。納品仕様は {spec.width}×{spec.height} px、PNG 上限 {Math.round(spec.maxBytesPng / 1024)}KB、GIF 上限 {Math.round(spec.maxBytesGif / 1024)}KB。
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {TEMPLATES.map((t) => (
          <div key={t.id} className="card flex gap-4 p-4">
            <img src={`/api/templates/${t.id}/preview`} alt={t.name} className="w-36 shrink-0 rounded-md border border-line bg-bg" style={{ aspectRatio: `${spec.width} / ${spec.height}` }} loading="lazy" />
            <div className="min-w-0">
              <h2 className="text-base font-black">{t.name}</h2>
              <p className="mt-1 text-xs text-muted">{t.description}</p>
              <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                {t.hooks.map((h) => (
                  <span key={h} className="chip bg-accent-soft text-accent">{appealLabel(h)}</span>
                ))}
                <span className="chip border border-line text-muted">{t.usesPhoto ? "写真に対応" : "装飾のみ"}</span>
                <code className="chip border border-line text-muted">{t.id}</code>
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="card flex flex-col gap-2 p-4 text-sm">
        <h2 className="text-sm font-black">型を増やすとき（デザインチーム向け）</h2>
        <ol className="list-decimal space-y-1 pl-5 text-xs text-muted">
          <li>過去の勝ち案から、既存の 4 型で表現できない構造（例: 円形写真 + 3 択、横長の特典帯）を 1 つ選ぶ。</li>
          <li>`src/lib/templates/index.tsx` にテンプレートを 1 つ追加する（帯・見出し・ビジュアル・バッジ・ボタン対の部品は共通）。対応するフックと写真対応の有無を宣言する。</li>
          <li>このページで表示を確認し、プリフライト（文字数・コントラスト）が通る初期値を決める。</li>
          <li>動きは {MOTIONS.map((m) => m.label.replace(/（.*）/, "")).join("・")} の共通実装がそのまま使える。</li>
        </ol>
        <p className="text-xs text-muted">フック: {APPEAL_AXES.map((a) => a.label).join("、")}。型 1 つに対し、文言はフックごとに生成されます。</p>
      </section>
    </div>
  );
}
