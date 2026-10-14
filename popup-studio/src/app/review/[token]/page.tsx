import { notFound } from "next/navigation";
import { db } from "@/lib/store";
import { verifyReviewToken } from "@/lib/review-token";
import { clientDecisionAction } from "@/lib/actions";
import { APPEAL_AXES, REJECT_REASONS } from "@/lib/types";
import { DevicePreview } from "@/components/DevicePreview";
import { StatusChip } from "@/components/StatusChip";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const briefId = verifyReviewToken(token);
  if (!briefId) notFound();
  const brief = await db.briefs.get(briefId);
  if (!brief) notFound();
  const creatives = (await db.creatives.listByBrief(briefId))
    .filter((c) => ["submitted", "approved", "rejected", "live"].includes(c.status))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const reviews = await db.reviews.listByBrief(briefId);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <section>
        <div className="text-xs font-bold text-accent">クリエイティブ確認</div>
        <h1 className="mt-1 text-2xl font-black tracking-tight">{brief.clientName} 様　離脱時ポップアップ案のご確認</h1>
        <p className="mt-2 text-sm text-muted">
          各案について「承認」または「修正依頼」をお選びください。スマホの実機表示に近いプレビューで確認できます。LP のスクリーンショットを重ねると、実際の見え方により近くなります。
        </p>
      </section>

      {creatives.length === 0 ? (
        <p className="card p-6 text-sm text-muted">現在ご確認いただく案はありません。</p>
      ) : (
        <ol className="flex flex-col gap-8">
          {creatives.map((c, idx) => {
            const fmt = c.motion === "static" ? "png" : "gif";
            const img = `/api/creatives/${c.id}/image?fmt=${fmt}&v=${c.version}`;
            const history = reviews.filter((r) => r.creativeId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            return (
              <li key={c.id} className="card grid gap-6 p-5 lg:grid-cols-[auto_minmax(0,1fr)]">
                <DevicePreview imageUrl={img} deviceSize={brief.deviceSize} lpImage={undefined} title={c.slots.headline} />
                <div className="flex min-w-0 flex-col gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-black">案 {idx + 1}</span>
                      <span className="chip bg-accent-soft text-accent">{APPEAL_AXES.find((a) => a.id === c.appealAxis)?.label}</span>
                      <StatusChip status={c.status} />
                    </div>
                    <h2 className="mt-2 text-lg font-black">{c.slots.headline}</h2>
                    <p className="text-sm text-muted">{c.slots.sub}</p>
                    <p className="mt-2 text-xs text-muted">この案で検証したいこと: {c.hypothesis}</p>
                  </div>

                  {c.status === "approved" ? (
                    <p className="rounded-md bg-accent-soft p-3 text-sm font-bold text-accent">承認済みです。ありがとうございます。</p>
                  ) : (
                    <form action={clientDecisionAction} className="flex flex-col gap-3 rounded-md border border-line p-4">
                      <input type="hidden" name="token" value={token} />
                      <input type="hidden" name="creativeId" value={c.id} />
                      <div>
                        <label className="label" htmlFor={`reviewer-${c.id}`}>お名前</label>
                        <input id={`reviewer-${c.id}`} name="reviewer" className="input" placeholder="例: 山田（マーケティング部）" />
                      </div>
                      <fieldset>
                        <legend className="label">修正依頼の場合、理由（複数可）</legend>
                        <div className="flex flex-wrap gap-2">
                          {REJECT_REASONS.map((r) => (
                            <label key={r.id} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs has-checked:border-danger has-checked:bg-danger-soft">
                              <input type="checkbox" name="reasons" value={r.id} className="accent-danger" /> {r.label}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <div>
                        <label className="label" htmlFor={`comment-${c.id}`}>コメント</label>
                        <textarea id={`comment-${c.id}`} name="comment" rows={2} className="input" placeholder="具体的な修正箇所や、気になった点" />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="submit" name="decision" value="approved" className="btn-primary">この案を承認</button>
                        <button type="submit" name="decision" value="rejected" className="btn-danger">修正を依頼</button>
                        <button type="submit" name="decision" value="comment" className="btn-ghost">コメントのみ送る</button>
                      </div>
                    </form>
                  )}

                  {history.length > 0 && (
                    <ul className="flex flex-col gap-2 text-xs">
                      {history.map((r) => (
                        <li key={r.id} className="rounded-md bg-bg p-2">
                          <span className="font-bold">{r.reviewer}</span> ・ {new Date(r.createdAt).toLocaleString("ja-JP")} ・ {r.decision === "approved" ? "承認" : r.decision === "rejected" ? "修正依頼" : "コメント"}
                          {r.comment && <div className="mt-1">{r.comment}</div>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
