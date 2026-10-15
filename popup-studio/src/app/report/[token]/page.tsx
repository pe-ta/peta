/* eslint-disable @next/next/no-img-element */
import { notFound } from "next/navigation";
import { db } from "@/lib/store";
import { verifyReportToken } from "@/lib/review-token";
import { WIN_METRICS, appealLabel, type Creative, type Learning } from "@/lib/types";
import { formatRate, judge, rate, windowedSnaps } from "@/lib/stats";
import { creativeImageUrl } from "@/lib/urls";
import { RateTrend } from "@/components/RateTrend";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

const OUTCOME_LABEL: Record<Exclude<Learning["outcome"], "note">, [string, string]> = {
  won: ["勝ち", "bg-accent-soft text-accent"],
  lost: ["負け", "bg-danger-soft text-danger"],
  inconclusive: ["差なし", "border border-line text-muted"],
};

function jstDay(iso: string) {
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric" }).format(new Date(iso));
}

/**
 * Read-only report for the client: what was tested, what won, how the champion improved,
 * and what comes next. Signed link (separate from the approval link), no internal notes,
 * no internal navigation, printable to PDF.
 */
export default async function ReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const briefId = verifyReportToken(token);
  if (!briefId) notFound();
  const brief = await db.briefs.get(briefId);
  if (!brief) notFound();
  const [creatives, learnings, hypotheses, snapshots] = await Promise.all([
    db.creatives.listByBrief(briefId),
    db.learnings.listByBrief(briefId),
    db.hypotheses.listByBrief(briefId),
    db.snapshots.listByBrief(briefId),
  ]);
  const metric = WIN_METRICS.find((m) => m.id === brief.winMetric) ?? WIN_METRICS[0];
  const champion = creatives.find((c) => c.id === brief.championId);
  const challengers = creatives.filter((c) => c.status === "live" && c.id !== brief.championId);
  const launched = creatives.filter((c) => c.experiment?.startedAt).sort((a, b) => a.experiment!.startedAt.localeCompare(b.experiment!.startedAt));
  const first = launched[0];
  const results = learnings.filter((l) => l.outcome !== "note").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const wins = results.filter((l) => l.outcome === "won").length;
  const byId = new Map(creatives.map((c) => [c.id, c]));
  const nextUp = hypotheses.filter((h) => h.status === "backlog" || h.status === "drafting").sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt)).slice(0, 3);

  const firstRate = first && first.id !== champion?.id ? rate(brief.winMetric, first.results) : null;
  const champRate = rate(brief.winMetric, champion?.results);
  const lift = firstRate && champRate ? champRate / firstRate - 1 : null;
  // Results can predate the launch click (the platform starts first), so the period starts at the earliest record.
  const firstSnap = [...snapshots].sort((a, b) => a.date.localeCompare(b.date))[0]?.date;
  const startDay = [first?.experiment?.startedAt ? jstDay(first.experiment.startedAt) : null, firstSnap ? jstDay(`${firstSnap}T00:00:00+09:00`) : null].filter((x): x is string => !!x).sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
  const period = startDay ? `${startDay} 〜 ${jstDay(new Date().toISOString())}` : "未配信";

  const thumb = (c: Creative, w = "w-28") => <img src={creativeImageUrl(c, brief, "png")} alt={c.slots.headline} className={`${w} shrink-0 rounded-md border border-line bg-bg`} />;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 print:max-w-none print:gap-5">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-bold text-accent">離脱時ポップアップ 検証レポート</div>
          <h1 className="mt-1 text-2xl font-black tracking-tight">{brief.clientName} 様</h1>
          <p className="mt-1 text-sm text-muted">対象期間: {period} ・ 成果指標: {metric.label}</p>
        </div>
        <PrintButton />
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card p-4"><div className="text-xs font-bold text-muted">検証した仮説</div><div className="mt-1 text-3xl font-black tabular-nums">{hypotheses.filter((h) => h.status === "testing" || h.status === "concluded").length}</div></div>
        <div className="card p-4"><div className="text-xs font-bold text-muted">結論が出た比較</div><div className="mt-1 text-3xl font-black tabular-nums">{results.length}</div><div className="text-xs text-muted">うち勝ち {wins}</div></div>
        <div className="card p-4"><div className="text-xs font-bold text-muted">現在の{metric.label}</div><div className="mt-1 text-3xl font-black tabular-nums text-accent">{formatRate(champRate)}</div><div className="text-xs text-muted">現行ポップアップ</div></div>
        <div className="card p-4">
          <div className="text-xs font-bold text-muted">最初のポップアップ比</div>
          <div className={`mt-1 text-3xl font-black tabular-nums ${lift !== null && lift > 0 ? "text-accent" : ""}`}>{lift === null ? "—" : `${lift > 0 ? "+" : ""}${Math.round(lift * 100)}%`}</div>
          <div className="text-xs text-muted">{lift === null ? "入れ替えが起きると表示" : `${formatRate(firstRate)} → ${formatRate(champRate)}`}</div>
        </div>
      </section>

      <section className="card flex flex-col gap-3 p-4 print:break-inside-avoid">
        <h2 className="text-lg font-black">現行のポップアップ</h2>
        {champion ? (
          <div className="flex gap-4">
            {thumb(champion, "w-36")}
            <div className="min-w-0 text-sm">
              <div className="font-bold">{champion.slots.headline}</div>
              <div className="mt-1 text-xs text-muted">訴求: {appealLabel(champion.appealAxis)} ・ 配信開始 {champion.experiment?.startedAt ? jstDay(champion.experiment.startedAt) : "—"}</div>
              <div className="mt-2 tabular-nums">{metric.label} <b className="text-accent">{formatRate(champRate)}</b>（{(champion.results?.impressions ?? 0).toLocaleString()} 表示）</div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">まだ配信していません。</p>
        )}
      </section>

      {challengers.length > 0 && champion && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-black">検証中の案</h2>
          {challengers.map((c) => {
            const j = judge(brief.winMetric, c, champion, snapshots);
            const status = j.verdict === "won" ? "現行より良い結果が確定しました。入れ替えを予定しています" : j.verdict === "lost" ? "現行の方が良い結果が確定しました。この案は終了します" : j.verdict === "insufficient" ? "表示数が少なく、まだ判断できません" : `現行を上回る見込み ${Math.round(j.pWin * 100)}%。差が確定するまで配信を続けます`;
            return (
              <div key={c.id} className="card flex flex-col gap-3 p-4 sm:flex-row print:break-inside-avoid">
                {thumb(c)}
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-bold">{c.slots.headline}</div>
                  <div className="mt-1 text-xs text-muted">ねらい: {c.hypothesis}</div>
                  <div className="mt-2 tabular-nums">
                    {metric.label} <b>{formatRate(j.challengerRate)}</b> <span className="text-muted">（現行 {formatRate(j.championRate)}）</span>
                  </div>
                  <div className={`mt-1 text-xs font-bold ${j.verdict === "won" ? "text-accent" : j.verdict === "lost" ? "text-danger" : "text-muted"}`}>{status}</div>
                  <RateTrend metric={brief.winMetric} series={[{ label: j.baseline ? "現行（同じ期間）" : "現行", snaps: windowedSnaps(snapshots.filter((s) => s.creativeId === champion.id), j.baseline), tone: "muted" }, { label: "この案", snaps: snapshots.filter((s) => s.creativeId === c.id), tone: "accent" }]} />
                </div>
              </div>
            );
          })}
        </section>
      )}

      <section className="card flex flex-col gap-3 p-4">
        <h2 className="text-lg font-black">これまでの結果と学び</h2>
        {results.length === 0 ? (
          <p className="text-sm text-muted">まだ結論の出た比較はありません。</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {results.map((l) => {
              const c = l.creativeId ? byId.get(l.creativeId) : undefined;
              const [label, cls] = OUTCOME_LABEL[l.outcome as Exclude<Learning["outcome"], "note">];
              return (
                <li key={l.id} className="flex gap-3 border-t border-line pt-3 text-sm first:border-t-0 first:pt-0 print:break-inside-avoid">
                  {c && thumb(c, "w-16")}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`chip ${cls}`}>{label}</span>
                      <span className="text-muted">{jstDay(l.createdAt)}</span>
                      {l.dna && <span className="text-muted">訴求: {appealLabel(l.dna.hook)}</span>}
                    </div>
                    <div className="mt-1 font-bold">{l.hypothesis}</div>
                    {l.evidence && <div className="text-xs text-muted">{l.evidence.replace(/（.*?）/g, "").replace(/チャンピオン/g, "現行")}</div>}
                    {l.nextHypothesis && <div className="mt-1 text-xs">次の打ち手: {l.nextHypothesis}</div>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="card flex flex-col gap-2 p-4 print:break-inside-avoid">
        <h2 className="text-lg font-black">次に検証すること</h2>
        {nextUp.length === 0 ? (
          <p className="text-sm text-muted">次の仮説を準備中です。</p>
        ) : (
          <ol className="list-decimal pl-5 text-sm">
            {nextUp.map((h) => (
              <li key={h.id} className="py-0.5">
                <span className="font-bold">{h.title}</span> <span className="text-xs text-muted">（{appealLabel(h.hook)}）</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="text-[11px] leading-relaxed text-muted">
        判定方法: 同じ期間に配信した現行案と新しい案の{metric.label}を比べ、途中で何度確認しても誤判定が 5% を超えない統計手法（逐次検定）で差が確定したものだけを「勝ち」「負け」としています。「差なし」は十分な表示数でも差が確認できなかった比較です。
      </p>
    </div>
  );
}
