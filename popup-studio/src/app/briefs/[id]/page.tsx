import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/store";
import { runPreflight } from "@/lib/preflight";
import { reviewToken } from "@/lib/review-token";
import { regenerateAction, submitForReviewAction } from "@/lib/actions";
import { APPEAL_AXES, REJECT_REASONS } from "@/lib/types";
import { CreativeCard } from "@/components/CreativeCard";
import { CopyButton } from "@/components/CopyButton";

export const dynamic = "force-dynamic";

export default async function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brief = await db.briefs.get(id);
  if (!brief) notFound();
  const creatives = (await db.creatives.listByBrief(id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const reviews = (await db.reviews.listByBrief(id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const token = reviewToken(id);
  const approved = creatives.filter((c) => c.status === "approved");

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="text-xs text-muted">
          <Link href="/" className="hover:underline">ブリーフ一覧</Link> / {brief.clientName}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight">{brief.clientName}</h1>
            <p className="mt-1 text-sm text-muted">
              {brief.offer} ・ {brief.target}
              {brief.exitContext ? ` ・ ${brief.exitContext}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              <span className="chip border border-line text-muted">{brief.deviceSize.toUpperCase()}</span>
              <span className="chip border border-line text-muted">コピー: {brief.copySource === "ai" ? "AI生成" : "ルールベース"}</span>
              {brief.lpUrl && (
                <a href={brief.lpUrl} target="_blank" rel="noreferrer" className="chip border border-line text-muted hover:underline">
                  LP: {brief.lpTitle ?? brief.lpUrl}
                </a>
              )}
              <span className="chip border border-line" style={{ background: brief.brand.primary, color: "#fff" }}>主色 {brief.brand.primary}</span>
              <span className="chip border border-line" style={{ background: brief.brand.accent, color: "#fff" }}>アクセント {brief.brand.accent}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={regenerateAction}>
              <input type="hidden" name="briefId" value={brief.id} />
              <button className="btn-ghost" type="submit">下書きを再生成</button>
            </form>
            <a className="btn-ghost" href={`/api/briefs/${brief.id}/export`}>
              {approved.length > 0 ? `承認済み ${approved.length} 案を書き出し` : "全案を書き出し（ZIP）"}
            </a>
          </div>
        </div>
      </section>

      <section className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-black">クライアント承認ポータル</div>
          <div className="mt-0.5 text-xs text-muted">提出済みの案を、実機プレビュー付きでクライアントに確認・承認してもらうリンクです。ログイン不要・署名付き。</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded bg-bg px-2 py-1 text-xs">/review/{token}</code>
          <CopyButton text={`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/review/${token}`} label="リンクをコピー" />
          <Link href={`/review/${token}`} className="btn-ghost" target="_blank">開く</Link>
        </div>
      </section>

      <form action={submitForReviewAction} className="flex flex-col gap-4">
        <input type="hidden" name="briefId" value={brief.id} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-black">生成された案（{creatives.length}）</h2>
          <button type="submit" className="btn-primary">チェックした案をクライアントに提出</button>
        </div>
        {creatives.length === 0 ? (
          <p className="text-sm text-muted">案がありません。「下書きを再生成」を押してください。</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {creatives.map((c) => (
              <CreativeCard key={c.id} creative={c} preflight={runPreflight(brief, c)} deviceSize={brief.deviceSize} selectable />
            ))}
          </div>
        )}
      </form>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card p-4">
          <h2 className="text-sm font-black">仮説一覧</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {creatives.map((c) => (
              <li key={c.id} className="flex gap-2">
                <span className="chip shrink-0 bg-accent-soft text-accent">{APPEAL_AXES.find((a) => a.id === c.appealAxis)?.label}</span>
                <Link href={`/creatives/${c.id}`} className="hover:underline">{c.hypothesis}</Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-4">
          <h2 className="text-sm font-black">クライアントからのフィードバック（{reviews.length}）</h2>
          {reviews.length === 0 ? (
            <p className="mt-3 text-sm text-muted">まだフィードバックはありません。</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3 text-sm">
              {reviews.map((r) => {
                const c = creatives.find((x) => x.id === r.creativeId);
                return (
                  <li key={r.id} className="rounded-md border border-line p-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`chip ${r.decision === "approved" ? "bg-accent-soft text-accent" : r.decision === "rejected" ? "bg-danger-soft text-danger" : "border border-line text-muted"}`}>
                        {r.decision === "approved" ? "承認" : r.decision === "rejected" ? "差戻し" : "コメント"}
                      </span>
                      <span className="font-bold">{r.reviewer}</span>
                      <span className="text-muted">{new Date(r.createdAt).toLocaleString("ja-JP")}</span>
                      {r.reasons.map((x) => (
                        <span key={x} className="chip border border-line text-muted">{REJECT_REASONS.find((rr) => rr.id === x)?.label}</span>
                      ))}
                    </div>
                    {c && <Link href={`/creatives/${c.id}`} className="mt-1 block text-xs text-muted hover:underline">対象: {c.slots.headline}</Link>}
                    {r.comment && <p className="mt-1">{r.comment}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
