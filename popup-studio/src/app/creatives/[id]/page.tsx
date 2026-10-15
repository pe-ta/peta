/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/store";
import { runPreflight } from "@/lib/preflight";
import { critiqueAction, deleteCreativeAction, setStatusAction, updateCreativeAction } from "@/lib/actions";
import { aiAvailable } from "@/lib/ai";
import { appealLabel, MOTIONS, normalizeMotion, normalizeVisual, VISUAL_AXES } from "@/lib/types";
import { getTemplate, TEMPLATES } from "@/lib/templates";
import { dnaOf, STRUCTURE_LABEL } from "@/lib/dna";
import { PreflightList } from "@/components/PreflightList";
import { StatusChip } from "@/components/StatusChip";
import { CritiquePanel } from "@/components/CritiquePanel";
import { Flash, readFlash } from "@/components/Flash";
import { ConfirmButton } from "@/components/ConfirmButton";
import { PendingButton } from "@/components/PendingButton";
import { creativeImageUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function CreativePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const { id } = await params;
  const creative = await db.creatives.get(id);
  if (!creative) notFound();
  const brief = await db.briefs.get(creative.briefId);
  if (!brief) notFound();
  const flash = readFlash(await searchParams);
  const preflight = runPreflight(brief, creative);
  const template = getTemplate(creative.templateId);
  const fmt = normalizeMotion(creative.motion) === "static" ? "png" : "gif";
  const img = creativeImageUrl(creative, brief, fmt);
  const isChampion = brief.championId === creative.id;
  const locked = ["live", "ended"].includes(creative.status);
  const dna = dnaOf(creative);
  const motionLabel = MOTIONS.find((m) => m.id === normalizeMotion(creative.motion))?.label;

  return (
    <div className="flex flex-col gap-6">
      <div className="text-xs text-muted">
        <Link href="/" className="hover:underline">実験ボード</Link> / <Link href={`/briefs/${brief.id}`} className="hover:underline">{brief.clientName}</Link> / 挑戦者の編集
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-black tracking-tight">{creative.slots.headline}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {isChampion && <span className="chip bg-accent text-white">チャンピオン</span>}
            <StatusChip status={creative.status} />
            <span className="chip bg-accent-soft text-accent">{appealLabel(creative.appealAxis)}</span>
            <span className="chip border border-line text-muted">{template.name}</span>
            <span className="chip border border-line text-muted">{STRUCTURE_LABEL[dna.structure]}</span>
            <span className="chip border border-line text-muted">{motionLabel}</span>
            <span className="chip border border-line text-muted">v{creative.version}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1" title="DNA タグ（学びログで集計する軸）">
            {dna.tags.map((t) => (
              <span key={t} className="chip bg-bg text-[11px] text-muted">{t}</span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn-ghost" href={creativeImageUrl(creative, brief, fmt, { download: "1" })}>{fmt.toUpperCase()} をダウンロード</a>
          {fmt === "gif" && <a className="btn-ghost" href={creativeImageUrl(creative, brief, "png", { download: "1" })}>静止 PNG も</a>}
          {creative.status === "draft" && (
            <form action={setStatusAction}>
              <input type="hidden" name="creativeId" value={creative.id} />
              <input type="hidden" name="status" value="reviewing" />
              <PendingButton pendingText="更新中…" className="btn-ghost">社内レビュー済みにする</PendingButton>
            </form>
          )}
        </div>
      </div>

      <Flash {...flash} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="card flex flex-col gap-4 p-4">
          <div className="rounded-md border border-line p-3 text-sm">
            <div className="text-xs font-bold text-accent">検証仮説</div>
            <div className="font-bold">{creative.hypothesis}</div>
            {creative.rationale && <div className="mt-1 text-xs text-muted">根拠: {creative.rationale}</div>}
          </div>
          <div className="rounded-md bg-bg p-3">
            <img src={img} alt={creative.slots.headline} className="mx-auto max-h-[560px] w-auto max-w-full rounded-md" />
            {fmt === "gif" && <p className="mt-2 text-center text-[11px] text-muted">GIF（{motionLabel}）。一覧のサムネイルは静止画です。</p>}
          </div>
          <div className="rounded-md border border-line p-4">
            {creative.critique ? (
              <CritiquePanel critique={creative.critique} />
            ) : (
              <div className="flex flex-col items-start gap-2">
                <h3 className="text-sm font-black">辛口分析</h3>
                <p className="text-xs text-muted">
                  画像を見て 6 軸で採点し、ダメな理由と直し方を文言レベルで出します。チャンピオンがいる場合は勝敗予測も。
                  {!aiAvailable() && " いまは API キー未設定のため簡易判定です。"}
                </p>
              </div>
            )}
            <form action={critiqueAction} className="mt-3">
              <input type="hidden" name="creativeId" value={creative.id} />
              <PendingButton pendingText="分析中…（AI は 10〜20 秒）">{creative.critique ? "もう一度、辛口分析する" : "辛口分析を実行"}</PendingButton>
            </form>
          </div>
          <PreflightList result={preflight} />
        </section>

        <section className="card p-4">
          {locked ? (
            <div className="rounded-md bg-bg p-4 text-sm text-muted">
              配信中・終了した案は編集できません（実験の比較対象が変わってしまうため）。文言を変えたい場合は、この案を元に新しい候補を再生成してください。
            </div>
          ) : (
            <form action={updateCreativeAction} className="flex flex-col gap-4">
              <input type="hidden" name="creativeId" value={creative.id} />
              <h2 className="text-sm font-black">5 段構造を編集</h2>
              <p className="text-xs text-muted">帯 → 質問見出し → ビジュアル → 小バッジ → ボタン対。保存すると版が上がり（v{creative.version + 1}）、辛口分析はリセットされます。</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="eyebrow">帯（上部リボン）</label>
                  <input id="eyebrow" name="eyebrow" defaultValue={creative.slots.eyebrow} className="input" placeholder="LINEで無料診断！" maxLength={20} />
                </div>
                <div>
                  <label className="label" htmlFor="badge">小バッジ{template.id === "campaign" ? "（大きな数字）" : ""}</label>
                  <input id="badge" name="badge" defaultValue={creative.slots.badge ?? ""} className="input" placeholder={template.id === "campaign" ? "最大2万円" : "LINEで簡単30秒"} maxLength={12} />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="headline">質問見出し *（〜しませんか？ / 〜知りたい！）</label>
                <input id="headline" name="headline" defaultValue={creative.slots.headline} className="input" required maxLength={40} />
              </div>
              <div>
                <label className="label" htmlFor="sub">補足（1 行）</label>
                <input id="sub" name="sub" defaultValue={creative.slots.sub} className="input" maxLength={40} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="negative">否定ボタン（左・グレー）</label>
                  <input id="negative" name="negative" defaultValue={creative.slots.negative ?? ""} className="input" placeholder="いいえ / また今度（空なら CTA 1 本）" maxLength={8} />
                </div>
                <div>
                  <label className="label" htmlFor="cta">肯定ボタン（右・アクセント）*</label>
                  <input id="cta" name="cta" defaultValue={creative.slots.cta} className="input" required placeholder="はい / 診断する / 知りたい" maxLength={12} />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="options">選択肢（多択型で使用・読点区切り・2〜3 個）{template.id !== "choice" && <span className="font-normal text-muted"> レイアウトを多択型にすると表示されます</span>}</label>
                <input id="options" name="options" defaultValue={creative.slots.options?.join("、") ?? ""} className="input" placeholder="体験型、積み上げ型" />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="label" htmlFor="templateId">レイアウト</label>
                  <select id="templateId" name="templateId" defaultValue={template.id} className="input">
                    {TEMPLATES.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="visualAxis">ビジュアル</label>
                  <select id="visualAxis" name="visualAxis" defaultValue={normalizeVisual(creative.visualAxis)} className="input">
                    {VISUAL_AXES.map((v) => (
                      <option key={v.id} value={v.id}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="motion">動き</label>
                  <select id="motion" name="motion" defaultValue={normalizeMotion(creative.motion)} className="input">
                    {MOTIONS.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="label" htmlFor="primary">主色（上書き）</label>
                  <input id="primary" name="primary" defaultValue={creative.slots.primary ?? ""} className="input" placeholder={brief.brand.primary} pattern="^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$" />
                </div>
                <div>
                  <label className="label" htmlFor="accent">アクセント（上書き）</label>
                  <input id="accent" name="accent" defaultValue={creative.slots.accent ?? ""} className="input" placeholder={brief.brand.accent} pattern="^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$" />
                </div>
              </div>
              {(normalizeVisual(creative.visualAxis) === "photo" || template.usesPhoto) && (
                <div>
                  <label className="label" htmlFor="imageUrl">写真URL（ビジュアル「写真」で使用。https のみ。空なら装飾ビジュアル）</label>
                  <input id="imageUrl" name="imageUrl" type="url" defaultValue={creative.slots.imageUrl ?? ""} className="input" placeholder="https://... (LPのOG画像や商品写真)" />
                </div>
              )}
              <div>
                <label className="label" htmlFor="hypothesis">検証仮説</label>
                <input id="hypothesis" name="hypothesis" defaultValue={creative.hypothesis} className="input" maxLength={120} />
              </div>
              <div className="flex items-center justify-between gap-3 pt-2">
                <PendingButton pendingText="再描画中…">保存して再描画</PendingButton>
              </div>
            </form>
          )}
          {!locked && !isChampion && (
            <form action={deleteCreativeAction} className="mt-4 flex justify-end border-t border-line pt-4">
              <input type="hidden" name="creativeId" value={creative.id} />
              <ConfirmButton className="btn-danger" message="この案を削除します。元に戻せません。よろしいですか？">この案を削除</ConfirmButton>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
