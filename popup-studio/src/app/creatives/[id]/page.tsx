/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/store";
import { runPreflight } from "@/lib/preflight";
import { critiqueAction, deleteCreativeAction, setStatusAction, updateCreativeAction } from "@/lib/actions";
import { aiAvailable } from "@/lib/ai";
import { APPEAL_AXES, MOTIONS } from "@/lib/types";
import { getTemplate } from "@/lib/templates";
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
  const fmt = creative.motion === "static" ? "png" : "gif";
  const img = creativeImageUrl(creative, brief, fmt);
  const isChampion = brief.championId === creative.id;
  const locked = ["live", "ended"].includes(creative.status);

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
            <span className="chip bg-accent-soft text-accent">{APPEAL_AXES.find((a) => a.id === creative.appealAxis)?.label}</span>
            <span className="chip border border-line text-muted">{template.name}</span>
            <span className="chip border border-line text-muted">{MOTIONS.find((m) => m.id === creative.motion)?.label}</span>
            <span className="chip border border-line text-muted">v{creative.version}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn-ghost" href={creativeImageUrl(creative, brief, fmt, { download: "1" })}>{fmt.toUpperCase()} をダウンロード</a>
          {creative.motion !== "static" && <a className="btn-ghost" href={creativeImageUrl(creative, brief, "png", { download: "1" })}>静止 PNG も</a>}
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
            {creative.motion !== "static" && <p className="mt-2 text-center text-[11px] text-muted">GIF（{MOTIONS.find((m) => m.id === creative.motion)?.label}）。一覧のサムネイルは静止画です。</p>}
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
              <h2 className="text-sm font-black">テキストと配色を編集</h2>
              <p className="text-xs text-muted">保存すると版が上がり（v{creative.version + 1}）、辛口分析はリセットされます。提出済みの案を直した場合は再提出してください。</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="eyebrow">小見出し</label>
                  <input id="eyebrow" name="eyebrow" defaultValue={creative.slots.eyebrow} className="input" maxLength={16} />
                </div>
                <div>
                  <label className="label" htmlFor="badge">バッジ（数字）</label>
                  <input id="badge" name="badge" defaultValue={creative.slots.badge ?? ""} className="input" placeholder="55%OFF" maxLength={8} />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="headline">見出し *</label>
                <input id="headline" name="headline" defaultValue={creative.slots.headline} className="input" required maxLength={40} />
              </div>
              <div>
                <label className="label" htmlFor="sub">サブコピー</label>
                <textarea id="sub" name="sub" defaultValue={creative.slots.sub} rows={2} className="input" maxLength={80} />
              </div>
              <div>
                <label className="label" htmlFor="cta">CTA *</label>
                <input id="cta" name="cta" defaultValue={creative.slots.cta} className="input" required maxLength={20} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="label" htmlFor="motion">動き</label>
                  <select id="motion" name="motion" defaultValue={creative.motion} className="input">
                    {MOTIONS.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="primary">主色（上書き）</label>
                  <input id="primary" name="primary" defaultValue={creative.slots.primary ?? ""} className="input" placeholder={brief.brand.primary} pattern="^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$" />
                </div>
                <div>
                  <label className="label" htmlFor="accent">アクセント（上書き）</label>
                  <input id="accent" name="accent" defaultValue={creative.slots.accent ?? ""} className="input" placeholder={brief.brand.accent} pattern="^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$" />
                </div>
              </div>
              {template.visualAxis === "image" && (
                <div>
                  <label className="label" htmlFor="imageUrl">画像URL（https のみ。空なら装飾ビジュアル）</label>
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
