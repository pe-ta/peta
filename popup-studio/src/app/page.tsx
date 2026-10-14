/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { db } from "@/lib/store";
import { WIN_METRICS } from "@/lib/types";
import { leadTimeDays, rate, formatRate } from "@/lib/stats";
import { LearningLog } from "@/components/LearningLog";

export const dynamic = "force-dynamic";

function weekAgoIso() {
  return new Date(Date.now() - 7 * 86_400_000).toISOString();
}

/**
 * 実験ボード: one row per client with the champion, live challengers,
 * and how many hypotheses reached a conclusion this week.
 */
export default async function Board() {
  const briefs = (await db.briefs.list()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const learnings = (await db.learnings.list()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const weekAgo = weekAgoIso();

  const rows = await Promise.all(
    briefs.map(async (b) => {
      const cs = await db.creatives.listByBrief(b.id);
      const champion = cs.find((c) => c.id === b.championId);
      const live = cs.filter((c) => c.status === "live" && c.id !== b.championId);
      const concluded = learnings.filter((l) => l.briefId === b.id && l.outcome !== "note" && l.createdAt >= weekAgo);
      return {
        brief: b,
        total: cs.length,
        champion,
        live,
        awaiting: cs.filter((c) => c.status === "submitted").length,
        approved: cs.filter((c) => c.status === "approved").length,
        concludedThisWeek: concluded.length,
        leadTime: leadTimeDays(b, cs),
      };
    }),
  );

  const totals = {
    live: rows.reduce((n, r) => n + r.live.length, 0),
    concluded: rows.reduce((n, r) => n + r.concludedThisWeek, 0),
    awaiting: rows.reduce((n, r) => n + r.awaiting, 0),
  };
  const names = new Map(briefs.map((b) => [b.id, b.clientName]));

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <div className="text-xs font-bold text-accent">勝ちポップアップ発見エンジン</div>
        <h1 className="text-2xl font-black tracking-tight">実験ボード</h1>
        <p className="max-w-3xl text-sm text-muted">
          ポップアップは「作って提出する成果物」ではなく「勝つまで回す実験」です。クライアントごとに現行チャンピオンへ挑戦者をぶつけ、結論の出た仮説を増やします。
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4"><div className="text-xs font-bold text-muted">今週、結論の出た仮説</div><div className="mt-1 text-3xl font-black tabular-nums text-accent">{totals.concluded}</div><div className="text-xs text-muted">North Star。現状比 3x が目標</div></div>
        <div className="card p-4"><div className="text-xs font-bold text-muted">挑戦中の案</div><div className="mt-1 text-3xl font-black tabular-nums">{totals.live}</div><div className="text-xs text-muted">チャンピオンと同時配信中</div></div>
        <div className="card p-4"><div className="text-xs font-bold text-muted">クライアント確認待ち</div><div className="mt-1 text-3xl font-black tabular-nums text-warn">{totals.awaiting}</div><div className="text-xs text-muted">承認ポータルで滞留している案</div></div>
      </section>

      {rows.length === 0 ? (
        <div className="card flex flex-col items-start gap-4 p-8">
          <div>
            <h2 className="text-lg font-black">最初の実験を始めましょう</h2>
            <p className="mt-1 text-sm text-muted">ブリーフを作ると、訴求軸 × ビジュアル × 動きの仮説グリッドから挑戦者候補を生成し、辛口分析でふるいにかけ、承認 → 配信 → 勝敗判定まで一本で回せます。</p>
          </div>
          <Link href="/briefs/new" className="btn-primary">新しいブリーフ（実験）を作る</Link>
        </div>
      ) : (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-black">クライアント別</h2>
          <ul className="flex flex-col gap-3">
            {rows.map((r) => {
              const metric = WIN_METRICS.find((m) => m.id === r.brief.winMetric)!;
              return (
                <li key={r.brief.id} className="card grid gap-4 p-4 lg:grid-cols-[88px_minmax(0,1fr)_auto]">
                  <Link href={`/briefs/${r.brief.id}`} className="block">
                    {r.champion ? (
                      <img src={`/api/creatives/${r.champion.id}/image?fmt=png&v=${r.champion.version}`} alt="" className="w-[88px] rounded-md bg-bg" />
                    ) : (
                      <div className="flex aspect-[4/5] w-[88px] items-center justify-center rounded-md border border-dashed border-line text-[10px] text-muted">未配信</div>
                    )}
                  </Link>
                  <div className="min-w-0">
                    <Link href={`/briefs/${r.brief.id}`} className="text-base font-black hover:underline">{r.brief.clientName}</Link>
                    <div className="truncate text-xs text-muted">{r.brief.offer} ・ 勝ちの定義: {metric.label}</div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
                      <span>チャンピオン {r.champion ? <b className="text-accent">{formatRate(rate(r.brief.winMetric, r.champion.results))}</b> : <b className="text-muted">なし</b>}</span>
                      <span>挑戦中 <b>{r.live.length}</b></span>
                      <span>確認待ち <b className="text-warn">{r.awaiting}</b></span>
                      <span>承認済み（未配信） <b>{r.approved}</b></span>
                      <span>候補 <b>{r.total}</b></span>
                      <span>今週の結論 <b className="text-accent">{r.concludedThisWeek}</b></span>
                      <span>ブリーフ→初配信 <b>{r.leadTime === null ? "—" : `${r.leadTime.toFixed(1)}日`}</b></span>
                    </div>
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
        <h2 className="text-lg font-black">学びログ（全クライアント）</h2>
        <LearningLog items={learnings.slice(0, 10)} showBrief={names} />
      </section>
    </div>
  );
}
