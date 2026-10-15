import type { Brief, Creative, Hypothesis } from "./types";
import { compare } from "./stats";

/**
 * Where a client stands in the experiment loop, derived from its documents.
 * Used by the board (one row per client) and the "next step" box on the brief.
 */
export type Stage = "empty" | "drafting" | "awaiting_client" | "ready" | "live" | "decided" | "idle";

export const STAGE_LABEL: Record<Stage, string> = {
  empty: "未着手",
  drafting: "案を作成中",
  awaiting_client: "クライアント確認待ち",
  ready: "配信待ち",
  live: "検証中",
  decided: "結論を出す",
  idle: "次の仮説が必要",
};

export interface PipelineState {
  stage: Stage;
  /** Days the client has been in the current stage (from the newest relevant timestamp). */
  daysInStage: number;
  /** Something that should not have waited this long. */
  stale?: string;
  nextAction: string;
  champion?: Creative;
  live: Creative[];
  submitted: Creative[];
  approved: Creative[];
  drafts: Creative[];
  backlog: Hypothesis[];
}

const DAY = 86_400_000;
const daysSince = (iso?: string) => (iso ? Math.max(0, (Date.now() - new Date(iso).getTime()) / DAY) : 0);
const newest = (items: Array<{ updatedAt: string }>) => items.map((i) => i.updatedAt).sort().at(-1);

export function pipelineOf(brief: Brief, creatives: Creative[], hypotheses: Hypothesis[]): PipelineState {
  const champion = creatives.find((c) => c.id === brief.championId);
  const live = creatives.filter((c) => c.status === "live" && c.id !== brief.championId);
  const submitted = creatives.filter((c) => c.status === "submitted");
  const approved = creatives.filter((c) => c.status === "approved");
  const drafts = creatives.filter((c) => ["draft", "reviewing", "rejected"].includes(c.status));
  const backlog = hypotheses.filter((h) => h.status === "backlog").sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt));
  const base = { champion, live, submitted, approved, drafts, backlog };

  const decided = live.filter((c) => ["won", "lost"].includes(compare(brief.winMetric, c.results, champion?.results).verdict));
  if (decided.length) {
    const d = daysSince(decided[0].results?.updatedAt);
    return { ...base, stage: "decided", daysInStage: d, stale: d > 2 ? "判定が出てから 2 日以上経過" : undefined, nextAction: "判定の出た挑戦者を昇格／終了し、学びを記録する" };
  }
  if (live.length) {
    const d = daysSince(live.map((c) => c.experiment?.startedAt).sort()[0]);
    const noResults = live.some((c) => !c.results || c.results.impressions === 0);
    return { ...base, stage: "live", daysInStage: d, stale: noResults && d > 3 ? "配信開始から 3 日以上、結果が未入力" : d > 21 ? "3 週間判定が出ていない。差が小さい可能性" : undefined, nextAction: noResults ? "配信結果を取り込む" : "結果を更新しながら次の挑戦者を準備する" };
  }
  if (approved.length) {
    const d = daysSince(newest(approved));
    return { ...base, stage: "ready", daysInStage: d, stale: d > 2 ? "承認から 2 日以上、未配信" : undefined, nextAction: "書き出して入稿し、配信開始を押す" };
  }
  if (submitted.length) {
    const d = daysSince(newest(submitted));
    return { ...base, stage: "awaiting_client", daysInStage: d, stale: d > 3 ? "提出から 3 日以上、返事なし。リマインドを" : undefined, nextAction: "クライアントの承認を待つ（3 日で催促）" };
  }
  if (drafts.length) {
    const d = daysSince(newest(drafts));
    return { ...base, stage: "drafting", daysInStage: d, stale: d > 3 ? "下書きのまま 3 日以上" : undefined, nextAction: "辛口分析でふるい、2〜3 案を提出する" };
  }
  if (champion) {
    const d = daysSince(champion.experiment?.endedAt ?? champion.updatedAt);
    return { ...base, stage: "idle", daysInStage: d, stale: d > 5 ? "挑戦者不在のまま 5 日以上" : undefined, nextAction: backlog.length ? `バックログの「${backlog[0].title}」を案にする` : "仮説をバックログに追加し、挑戦者を作る" };
  }
  return { ...base, stage: "empty", daysInStage: daysSince(brief.createdAt), nextAction: "候補を生成する" };
}
