/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { Brief, Creative } from "@/lib/types";
import { WIN_METRICS } from "@/lib/types";
import { compare, formatRate, rate } from "@/lib/stats";
import { concludeAction, saveResultsAction } from "@/lib/actions";
import { creativeImageUrl } from "@/lib/urls";

/**
 * Champion vs challengers with manual result entry and the Bayesian verdict.
 */
export function ExperimentTable({
  brief,
  creatives,
}: {
  brief: Brief;
  creatives: Creative[];
}) {
  const champion = creatives.find((c) => c.id === brief.championId);
  const live = creatives.filter(
    (c) => c.status === "live" && c.id !== brief.championId,
  );
  const metric = WIN_METRICS.find((m) => m.id === brief.winMetric)!;

  if (!champion && live.length === 0) {
    return (
      <p className="text-sm text-muted">
        配信中の案はありません。承認済みの案を「配信開始」すると、最初の案がチャンピオン（比較の基準）になります。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {champion && (
        <Row brief={brief} champion={champion} c={champion} role="champion" />
      )}
      {live.map((c) => (
        <Row
          key={c.id}
          brief={brief}
          champion={champion}
          c={c}
          role="challenger"
        />
      ))}
      <p className="text-[11px] text-muted">
        判定: {metric.label} を Beta
        分布で推定し、挑戦者がチャンピオンを上回る確率 95% 以上で勝ち、5%
        以下で負け。双方 300 表示以上が必要。結果は配信基盤からの取り込み（Phase
        2）までは手入力。
      </p>
    </div>
  );
}

function Row({
  brief,
  champion,
  c,
  role,
}: {
  brief: Brief;
  champion?: Creative;
  c: Creative;
  role: "champion" | "challenger";
}) {
  const metric = WIN_METRICS.find((m) => m.id === brief.winMetric)!;
  const r = c.results;
  const cmp =
    role === "challenger"
      ? compare(brief.winMetric, c.results, champion?.results)
      : null;
  return (
    <div
      className={`grid gap-4 rounded-lg border p-4 lg:grid-cols-[96px_minmax(0,1fr)_minmax(0,1fr)] ${role === "champion" ? "border-accent bg-accent-soft/30" : "border-line"}`}
    >
      <Link href={`/creatives/${c.id}`} className="block">
        <img
          src={creativeImageUrl(c, brief, "png")}
          alt=""
          className="w-24 rounded-md bg-bg"
        />
      </Link>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span
            className={`chip ${role === "champion" ? "bg-accent text-white" : "bg-warn-soft text-warn"}`}
          >
            {role === "champion" ? "チャンピオン" : "挑戦者"}
          </span>
          {c.experiment?.startedAt && (
            <span className="text-muted">
              配信開始{" "}
              {new Date(c.experiment.startedAt).toLocaleDateString("ja-JP")}
            </span>
          )}
        </div>
        <div className="mt-1 truncate text-sm font-bold">
          {c.slots.headline}
        </div>
        <div className="mt-0.5 line-clamp-2 text-xs text-muted">
          仮説: {c.hypothesis}
        </div>
        <dl className="mt-2 grid grid-cols-4 gap-2 text-xs tabular-nums">
          <div>
            <dt className="text-muted">表示</dt>
            <dd className="font-bold">{r?.impressions ?? 0}</dd>
          </div>
          <div>
            <dt className="text-muted">クリック</dt>
            <dd className="font-bold">{r?.clicks ?? 0}</dd>
          </div>
          <div>
            <dt className="text-muted">LINE追加</dt>
            <dd className="font-bold">{r?.lineAdds ?? 0}</dd>
          </div>
          <div>
            <dt className="text-muted">CV</dt>
            <dd className="font-bold">{r?.conversions ?? 0}</dd>
          </div>
        </dl>
        <div className="mt-2 text-sm">
          <span className="text-xs text-muted">{metric.label} </span>
          <span className="font-black tabular-nums">
            {formatRate(rate(brief.winMetric, r))}
          </span>
          {cmp && (
            <span
              className={`ml-2 text-xs font-bold ${cmp.verdict === "won" ? "text-accent" : cmp.verdict === "lost" ? "text-danger" : "text-muted"}`}
            >
              {cmp.verdict === "won"
                ? "勝ち判定"
                : cmp.verdict === "lost"
                  ? "負け判定"
                  : cmp.verdict === "measuring"
                    ? "計測中"
                    : "データ不足"}{" "}
              ・ {cmp.reason}
            </span>
          )}
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <form action={saveResultsAction} className="grid grid-cols-5 gap-2">
          <input type="hidden" name="creativeId" value={c.id} />
          {(
            [
              ["impressions", "表示"],
              ["clicks", "クリック"],
              ["lineAdds", "LINE追加"],
              ["conversions", "CV"],
              ["blocks", "ブロック"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="text-[11px] text-muted">
              {label}
              <input
                name={k}
                type="number"
                min={0}
                defaultValue={r?.[k] ?? 0}
                className="input mt-0.5 px-2 py-1 text-xs"
              />
            </label>
          ))}
          <button type="submit" className="btn-ghost col-span-5 py-1 text-xs">
            結果を保存
          </button>
        </form>
        {role === "challenger" && (
          <form
            action={concludeAction}
            className="flex flex-col gap-2 rounded-md bg-bg p-2"
          >
            <input type="hidden" name="creativeId" value={c.id} />
            <input
              name="nextHypothesis"
              className="input px-2 py-1 text-xs"
              placeholder="次に試す仮説（任意）"
            />
            <div className="flex flex-wrap gap-1.5">
              <button
                type="submit"
                name="outcome"
                value="won"
                className="btn-primary py-1 text-xs"
                disabled={cmp?.verdict !== "won"}
                title={
                  cmp?.verdict !== "won"
                    ? "勝ち判定が出るまで昇格できません"
                    : ""
                }
              >
                チャンピオンに昇格
              </button>
              <button
                type="submit"
                name="outcome"
                value="lost"
                className="btn-danger py-1 text-xs"
              >
                負けとして終了
              </button>
              <button
                type="submit"
                name="outcome"
                value="inconclusive"
                className="btn-ghost py-1 text-xs"
              >
                結論なしで終了
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
