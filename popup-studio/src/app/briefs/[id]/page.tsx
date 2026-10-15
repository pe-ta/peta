import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/store";
import { runPreflight } from "@/lib/preflight";
import { reviewToken } from "@/lib/review-token";
import { addLearningAction, critiqueAllAction, regenerateAction, startExperimentAction, submitForReviewAction } from "@/lib/actions";
import { aiAvailable } from "@/lib/ai";
import { normalizeAppeal, REJECT_REASONS, WIN_METRICS } from "@/lib/types";
import { CreativeCard } from "@/components/CreativeCard";
import { CopyButton } from "@/components/CopyButton";
import { ExperimentTable } from "@/components/ExperimentTable";
import { LearningLog } from "@/components/LearningLog";
import { NextStep } from "@/components/NextStep";
import { Flash, readFlash } from "@/components/Flash";
import { ConfirmButton } from "@/components/ConfirmButton";
import { PendingButton } from "@/components/PendingButton";
import { SimilarCases } from "@/components/SimilarCases";
import { findSimilar } from "@/lib/library";
import { HypothesisBacklog } from "@/components/HypothesisBacklog";
import { ResultsImport } from "@/components/ResultsImport";
import { resultsToken } from "@/lib/results";
import { weakSecretInProduction } from "@/lib/secret";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function BriefPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const { id } = await params;
  const brief = await db.briefs.get(id);
  if (!brief) notFound();
  const flash = readFlash(await searchParams);
  const creatives = (await db.creatives.listByBrief(id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const reviews = (await db.reviews.listByBrief(id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const learnings = (await db.learnings.listByBrief(id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const hypotheses = await db.hypotheses.listByBrief(id);
  const snapshots = await db.snapshots.listByBrief(id);
  // Hypothesis suggestions: "next" lines from the learning log and the brief's unused hooks.
  const suggested = [...new Set([...learnings.map((l) => l.nextHypothesis).filter((x): x is string => !!x)])].slice(0, 6);
  // Win rate per hook across all clients, shown next to the hook picker so priorities start from evidence.
  const allLearnings = await db.learnings.list();
  const hookStats: Record<string, { won: number; lost: number }> = {};
  for (const l of allLearnings) {
    if (!l.dna || (l.outcome !== "won" && l.outcome !== "lost")) continue;
    const st = (hookStats[l.dna.hook] ??= { won: 0, lost: 0 });
    if (l.outcome === "won") st.won++;
    else st.lost++;
  }
  const token = reviewToken(id);
  const reviewPath = `/review/${token}`;
  const metric = WIN_METRICS.find((m) => m.id === brief.winMetric) ?? WIN_METRICS[0];

  const approved = creatives.filter((c) => c.status === "approved");
  const candidates = creatives.filter((c) => !["live", "ended"].includes(c.status));
  const unanalyzed = candidates.filter((c) => !c.critique).length;
  const ended = creatives.filter((c) => c.status === "ended");
  const hasExperiment = Boolean(brief.championId) || creatives.some((c) => c.status === "live");
  const similar = findSimilar(brief, brief.appealAxes[0] ? normalizeAppeal(brief.appealAxes[0]) : undefined, 6);

  const experimentSection = (
    <section className="card flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-lg font-black">実験: チャンピオン vs 挑戦者</h2>
        <p className="text-xs text-muted">結果を入力すると {metric.label} をベイズ推定で比較し、勝ち判定が出た挑戦者だけ昇格できます。</p>
      </div>
      <ExperimentTable brief={brief} creatives={creatives} snapshots={snapshots} />
      {(hasExperiment || creatives.some((c) => c.status === "live")) && <ResultsImport briefId={brief.id} creativeIds={creatives.filter((c) => c.status === "live").map((c) => c.id)} pushUrl={`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/briefs/${brief.id}/results`} pushToken={resultsToken(brief.id)} pushDisabled={weakSecretInProduction()} />}
      {approved.length > 0 && (
        <div className="rounded-md border border-dashed border-accent/50 bg-accent-soft/30 p-3">
          <div className="text-xs font-black text-accent">承認済み・未配信（{approved.length}）</div>
          <ul className="mt-2 flex flex-col gap-2">
            {approved.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <Link href={`/creatives/${c.id}`} className="min-w-0 truncate font-bold hover:underline">{c.slots.headline}</Link>
                <form action={startExperimentAction}>
                  <input type="hidden" name="creativeId" value={c.id} />
                  <PendingButton pendingText="投入中…" className="btn-primary py-1 text-xs">配信開始（挑戦者として投入）</PendingButton>
                </form>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted">書き出した PNG/GIF を配信基盤に入稿したら「配信開始」を押してください。最初の案は自動でチャンピオンになります。</p>
        </div>
      )}
    </section>
  );

  const candidatesSection = (
    <form action={submitForReviewAction} className="flex flex-col gap-4">
      <input type="hidden" name="briefId" value={brief.id} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">挑戦者候補（{candidates.length}）</h2>
          <p className="text-xs text-muted">各案は「仮説」です。辛口分析で 70 点以上を提出し、承認後に配信へ投入します。{!aiAvailable() && " 現在は簡易判定（API キー未設定）。"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PendingButton formAction={critiqueAllAction} pendingText="分析中…（AI の場合 3 案で約 30 秒）" className="btn-ghost" disabled={unanalyzed === 0}>
            未分析 {unanalyzed} 案を辛口分析
          </PendingButton>
          <PendingButton pendingText="提出中…">チェックした案をクライアントに提出</PendingButton>
        </div>
      </div>
      {candidates.length === 0 ? (
        <p className="rounded-md border border-dashed border-line p-6 text-center text-sm text-muted">候補がありません。右上の「下書きを再生成」で作れます。</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {candidates.map((c) => (
            <CreativeCard key={c.id} creative={c} preflight={runPreflight(brief, c)} deviceSize={brief.deviceSize} selectable isChampion={c.id === brief.championId} briefUpdatedAt={brief.updatedAt} />
          ))}
        </div>
      )}
    </form>
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="text-xs text-muted">
          <Link href="/" className="hover:underline">実験ボード</Link> / {brief.clientName}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-black tracking-tight">{brief.clientName}</h1>
            <p className="mt-1 text-sm text-muted">
              {brief.offer} ・ {brief.target}
              {brief.exitContext ? ` ・ ${brief.exitContext}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              <span className="chip bg-accent-soft text-accent">勝ちの定義: {metric.label}</span>
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
            <Link href={`/briefs/${brief.id}/edit`} className="btn-ghost">ブリーフを編集</Link>
            <form action={regenerateAction}>
              <input type="hidden" name="briefId" value={brief.id} />
              <ConfirmButton message="下書き状態の候補をすべて削除して作り直します。提出済み・承認済み・配信中の案は残ります。よろしいですか？">下書きを再生成</ConfirmButton>
            </form>
            <a className="btn-ghost" href={`/api/briefs/${brief.id}/export`}>
              {approved.length > 0 ? `承認済み ${approved.length} 案を書き出し` : "全案を書き出し（ZIP）"}
            </a>
          </div>
        </div>
      </section>

      <Flash {...flash} />
      <NextStep brief={brief} creatives={creatives} reviewPath={reviewPath} />

      {hasExperiment ? (
        <>
          {experimentSection}
          <HypothesisBacklog briefId={brief.id} hypotheses={hypotheses} creatives={creatives} suggested={suggested} hookStats={hookStats} />
          {candidatesSection}
        </>
      ) : (
        <>
          {candidatesSection}
          <HypothesisBacklog briefId={brief.id} hypotheses={hypotheses} creatives={creatives} suggested={suggested} hookStats={hookStats} />
          {experimentSection}
        </>
      )}

      <SimilarCases entries={similar} />

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card flex flex-col gap-3 p-4">
          <div>
            <div className="text-sm font-black">クライアント承認ポータル</div>
            <div className="mt-0.5 text-xs text-muted">提出済みの案を実機プレビュー付きで確認・承認してもらうリンク。ログイン不要・署名付き。</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 truncate rounded bg-bg px-2 py-1 text-xs">{reviewPath}</code>
            <CopyButton text={`${process.env.NEXT_PUBLIC_APP_URL ?? ""}${reviewPath}`} label="リンクをコピー" />
            <Link href={reviewPath} className="btn-ghost" target="_blank">開く</Link>
          </div>
          <h3 className="mt-2 text-sm font-black">フィードバック（{reviews.length}）</h3>
          {reviews.length === 0 ? (
            <p className="text-sm text-muted">まだフィードバックはありません。</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
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

        <div className="card flex flex-col gap-3 p-4">
          <h2 className="text-sm font-black">学びログ</h2>
          <LearningLog items={learnings} />
          <form action={addLearningAction} className="mt-2 flex flex-col gap-2 rounded-md bg-bg p-3">
            <input type="hidden" name="briefId" value={brief.id} />
            <div className="text-xs font-bold text-muted">メモを追加（配信外で得た学び、クライアントの反応など）</div>
            <input name="hypothesis" required className="input text-xs" placeholder="学び・仮説" />
            <input name="evidence" className="input text-xs" placeholder="根拠（任意）" />
            <input name="nextHypothesis" className="input text-xs" placeholder="次に試すこと（任意）" />
            <div className="flex items-center gap-2">
              <input name="author" className="input w-32 text-xs" placeholder="記入者" />
              <PendingButton pendingText="記録中…" className="btn-ghost py-1 text-xs">記録する</PendingButton>
            </div>
          </form>
          {ended.length > 0 && (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer font-bold">終了した案（{ended.length}）</summary>
              <ul className="mt-2 flex flex-col gap-1">
                {ended.map((c) => (
                  <li key={c.id}>
                    <Link href={`/creatives/${c.id}`} className="hover:underline">{c.slots.headline}</Link> ・ {c.experiment?.outcome === "won" ? "勝ち" : c.experiment?.outcome === "lost" ? "負け" : "結論なし"}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </section>
    </div>
  );
}
