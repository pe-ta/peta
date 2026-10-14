/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/store";
import { runPreflight } from "@/lib/preflight";
import { deleteCreativeAction, setStatusAction, updateCreativeAction } from "@/lib/actions";
import { APPEAL_AXES, MOTIONS } from "@/lib/types";
import { getTemplate } from "@/lib/templates";
import { PreflightList } from "@/components/PreflightList";
import { StatusChip } from "@/components/StatusChip";

export const dynamic = "force-dynamic";

export default async function CreativePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const creative = await db.creatives.get(id);
  if (!creative) notFound();
  const brief = await db.briefs.get(creative.briefId);
  if (!brief) notFound();
  const preflight = runPreflight(brief, creative);
  const template = getTemplate(creative.templateId);
  const fmt = creative.motion === "static" ? "png" : "gif";
  const img = `/api/creatives/${creative.id}/image?fmt=${fmt}&v=${creative.version}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="text-xs text-muted">
        <Link href="/" className="hover:underline">ブリーフ一覧</Link> / <Link href={`/briefs/${brief.id}`} className="hover:underline">{brief.clientName}</Link> / 案の編集
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-black tracking-tight">{creative.slots.headline}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <StatusChip status={creative.status} />
            <span className="chip bg-accent-soft text-accent">{APPEAL_AXES.find((a) => a.id === creative.appealAxis)?.label}</span>
            <span className="chip border border-line text-muted">{template.name}</span>
            <span className="chip border border-line text-muted">v{creative.version}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn-ghost" href={`${img}&download=1`}>{fmt.toUpperCase()} をダウンロード</a>
          {creative.motion !== "static" && <a className="btn-ghost" href={`/api/creatives/${creative.id}/image?fmt=png&v=${creative.version}&download=1`}>PNG（静止）も</a>}
          <form action={setStatusAction}>
            <input type="hidden" name="creativeId" value={creative.id} />
            <input type="hidden" name="status" value={creative.status === "approved" ? "live" : "reviewing"} />
            <button className="btn-ghost" type="submit">{creative.status === "approved" ? "配信中にする" : "社内レビューへ"}</button>
          </form>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="card flex flex-col gap-4 p-4">
          <div className="rounded-md bg-bg p-3">
            <img src={img} alt={creative.slots.headline} className="mx-auto max-h-[560px] w-auto max-w-full rounded-md" />
          </div>
          <PreflightList result={preflight} />
          <div className="rounded-md border border-line p-3 text-sm">
            <div className="text-xs font-bold text-muted">検証仮説</div>
            <div>{creative.hypothesis}</div>
            {creative.rationale && <div className="mt-1 text-xs text-muted">根拠: {creative.rationale}</div>}
          </div>
        </section>

        <section className="card p-4">
          <form action={updateCreativeAction} className="flex flex-col gap-4">
            <input type="hidden" name="creativeId" value={creative.id} />
            <h2 className="text-sm font-black">テキストと配色を編集</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="eyebrow">小見出し</label>
                <input id="eyebrow" name="eyebrow" defaultValue={creative.slots.eyebrow} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="badge">バッジ（数字）</label>
                <input id="badge" name="badge" defaultValue={creative.slots.badge ?? ""} className="input" placeholder="55%OFF" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="headline">見出し</label>
              <input id="headline" name="headline" defaultValue={creative.slots.headline} className="input" required />
            </div>
            <div>
              <label className="label" htmlFor="sub">サブコピー</label>
              <textarea id="sub" name="sub" defaultValue={creative.slots.sub} rows={2} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="cta">CTA</label>
              <input id="cta" name="cta" defaultValue={creative.slots.cta} className="input" required />
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
                <input id="primary" name="primary" defaultValue={creative.slots.primary ?? ""} className="input" placeholder={brief.brand.primary} />
              </div>
              <div>
                <label className="label" htmlFor="accent">アクセント（上書き）</label>
                <input id="accent" name="accent" defaultValue={creative.slots.accent ?? ""} className="input" placeholder={brief.brand.accent} />
              </div>
            </div>
            {template.visualAxis === "image" && (
              <div>
                <label className="label" htmlFor="imageUrl">画像URL</label>
                <input id="imageUrl" name="imageUrl" defaultValue={creative.slots.imageUrl ?? ""} className="input" placeholder="https://... (LPのOG画像など)" />
              </div>
            )}
            <div>
              <label className="label" htmlFor="hypothesis">検証仮説</label>
              <input id="hypothesis" name="hypothesis" defaultValue={creative.hypothesis} className="input" />
            </div>
            <div className="flex items-center justify-between gap-3 pt-2">
              <button type="submit" className="btn-primary">保存して再描画</button>
            </div>
          </form>
          <form action={deleteCreativeAction} className="mt-4 flex justify-end border-t border-line pt-4">
            <input type="hidden" name="creativeId" value={creative.id} />
            <button type="submit" className="btn-danger">この案を削除</button>
          </form>
        </section>
      </div>
    </div>
  );
}
