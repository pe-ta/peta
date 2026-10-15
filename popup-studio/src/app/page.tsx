/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { db } from "@/lib/store";
import { WIN_METRICS } from "@/lib/types";
import { leadTimeDays, rate, formatRate } from "@/lib/stats";
import { pipelineOf, STAGE_LABEL, type Stage } from "@/lib/pipeline";
import { LearningLog } from "@/components/LearningLog";
import { creativeImageUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function weekAgoIso() {
  return new Date(Date.now() - 7 * 86_400_000).toISOString();
}

const STAGE_CLASS: Record<Stage, string> = {
  empty: "border border-line text-muted",
  drafting: "bg-warn-soft text-warn",
  awaiting_client: "bg-warn-soft text-warn",
  ready: "bg-accent-soft text-accent",
  live: "bg-accent text-white",
  decided: "bg-danger-soft text-danger",
  idle: "border border-line text-muted",
};

/**
 * 実験ボード: one row per client with its stage in the loop, how long it has sat
 * there, what to do next, and the week's conclusions (North Star).
 */
export default async function Board() {
  const briefs = (await db.briefs.list()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const learnings = (await db.learnings.list()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const hypotheses = await db.hypotheses.list();
  const weekAgo = weekAgoIso();

  const rows = await Promise.all(
    briefs.map(async (b) => {
      const cs = await db.creatives.listByBrief(b.id);
      const hs = hypotheses.filter((h) => h.briefId === b.id);
      const p = pipelineOf(b, cs, hs);
      const concluded = learnings.filter((l) => l.briefId === b.id && l.outcome !== "note" && l.createdAt >= weekAgo);
      return { brief: b, p, total: cs.length, backlog: hs.filter((h) => h.status === "backlog").length, concludedThisWeek: concluded.length, leadTime: leadTimeDays(b, cs) };
    }),
  );
  // Stale and decided first, then by stage order, so the top of the board is the to-do list.
  const order: Stage[] = ["decided", "ready", "awaiting_client", "drafting", "live", "idle", "empty"];
  rows.sort((a, b) => Number(!!b.p.stale) - Number(!!a.p.stale) || order.indexOf(a.p.stage) - order.indexOf(b.p.stage) || b.p.daysInStage - a.p.daysInStage);

  const totals = {
    live: rows.reduce((n, r) => n + r.p.live.length, 0),
    concluded: rows.reduce((n, r) => n + r.concludedThisWeek, 0),
    awaiting: rows.reduce((n, r) => n + r.p.submitted.length, 0),
    stale: rows.filter((r) => r.p.stale).length,
    backlog: rows.reduce((n, r) => n + r.backlog, 0),
  };
  const names = new Map(briefs.map((b) => [b.id, b.clientName]));

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <div className="text-xs font-bold text-accent">勝ちポップアップ発見エンジン</div>
        <h1 className="text-2xl font-black tracking-tight">実験ボード</h1>
        <p className="max-w-3xl text-sm text-muted">
          ポップアップは「作って提出する成果物」ではなく「勝つまで回す実験」です。クライアントごとに現行チャンピオンへ挑戦者をぶつけ、結論の出た仮説を増やします。上に出ているクライアントから手を付けてください。
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="card p-4"><div className="text-xs font-bold text-muted">今週、結論の出た仮説</div><div className="mt-1 text-3xl font-black tabular-nums text-accent">{totals.concluded}</div><div className="text-xs text-muted">North Star。現状比 3x が目標</div></div>
        <div className="card p-4"><div className="text-xs font-bold text-muted">検証中の挑戦者</div><div className="mt-1 text-3xl font-black tabular-nums">{totals.live}</div><div className="text-xs text-muted">チャンピオンと同時配信中</div></div>
        <div className="card p-4"><div className="text-xs font-bold text-muted">クライアント確認待ち</div><div className="mt-1 text-3xl font-black tabular-nums text-warn">{totals.awaiting}</div><div className="text-xs text-muted">承認ポータルで滞留している案</div></div>
        <div className="card p-4"><div className="text-xs font-bold text-muted">滞留アラート</div><div className={`mt-1 text-3xl font-black tabular-nums ${totals.stale ? "text-danger" : ""}`}>{totals.stale}</div><div className="text-xs text-muted">段階に留まりすぎているクライアント</div></div>
        <div className="card p-4"><div className="text-xs font-bold text-muted">未着手の仮説</div><div className="mt-1 text-3xl font-black tabular-nums">{totals.backlog}</div><div className="text-xs text-muted">バックログの合計。空のクライアントは次が無い</div></div>
      </section>

      {rows.length === 0 ? (
        <div className="card flex flex-col items-start gap-4 p-8">
          <div>
            <h2 className="text-lg font-black">最初の実験を始めましょう</h2>
            <p className="mt-1 text-sm text-muted">ブリーフを作ると、フック × ビジュアル × 動きの仮説グリッドから挑戦者候補を生成し、辛口分析でふるいにかけ、承認 → 配信 → 勝敗判定まで一本で回せます。</p>
          </div>
          <Link href="/briefs/new" className="btn-primary">新しいブリーフ（実験）を作る</Link>
        </div>
      ) : (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-black">クライアント別（やることが多い順）</h2>
          <ul className="flex flex-col gap-3">
            {rows.map((r) => {
              const metric = WIN_METRICS.find((m) => m.id === r.brief.winMetric) ?? WIN_METRICS[0];
              return (
                <li key={r.brief.id} className={`card grid gap-4 p-4 lg:grid-cols-[72px_minmax(0,1fr)_minmax(0,22rem)_auto] ${r.p.stale ? "ring-1 ring-danger/40" : ""}`}>
                  <Link href={`/briefs/${r.brief.id}`} className="block">
                    {r.p.champion ? (
                      <img src={creativeImageUrl(r.p.champion, r.brief, "png")} alt="" className="w-[72px] rounded-md bg-bg" />
                    ) : (
                      <div className="flex w-[72px] items-center justify-center rounded-md border border-dashed border-line text-[10px] text-muted" style={{ aspectRatio: "900 / 1265" }}>未配信</div>
                    )}
                  </Link>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link href={`/briefs/${r.brief.id}`} className="text-base font-black hover:underline">{r.brief.clientName}</Link>
                      <span className={`chip ${STAGE_CLASS[r.p.stage]}`}>{STAGE_LABEL[r.p.stage]}</span>
                      <span className="text-xs text-muted">{r.p.daysInStage < 1 ? "今日" : `${Math.floor(r.p.daysInStage)} 日`}</span>
                    </div>
                    <div className="truncate text-xs text-muted">{r.brief.offer} ・ 勝ちの定義: {metric.label}</div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
                      <span>チャンピオン {r.p.champion ? <b className="text-accent">{formatRate(rate(r.brief.winMetric, r.p.champion.results))}</b> : <b className="text-muted">なし</b>}</span>
                      <span>検証中 <b>{r.p.live.length}</b></span>
                      <span>確認待ち <b className="text-warn">{r.p.submitted.length}</b></span>
                      <span>配信待ち <b>{r.p.approved.length}</b></span>
                      <span>バックログ <b>{r.backlog}</b></span>
                      <span>今週の結論 <b className="text-accent">{r.concludedThisWeek}</b></span>
                      <span>ブリーフ→初配信 <b>{r.leadTime === null ? "—" : `${r.leadTime.toFixed(1)}日`}</b></span>
                    </div>
                  </div>
                  <div className="min-w-0 text-xs">
                    <div className="font-bold text-muted">次にやること</div>
                    <div className="mt-0.5 font-bold">{r.p.nextAction}</div>
                    {r.p.stale && <div className="mt-1 font-bold text-danger">滞留: {r.p.stale}</div>}
                  </div>
                  <div className="flex items-start">
                    <Link href={`/briefs/${r.brief.id}`} className="btn-ghost">実験を開く</Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-black">学びログ（全クライアント）</h2>
          <Link href="/learnings" className="text-xs font-bold text-accent hover:underline">タグ別の勝率を見る</Link>
        </div>
        <LearningLog items={learnings.slice(0, 8)} showBrief={names} />
      </section>
    </div>
  );
}
