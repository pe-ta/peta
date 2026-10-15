import type { Brief, Creative, Hypothesis } from "./types";
import { compare, daysSince } from "./stats";

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
  /** Something that should not have waited this long (checked across all stages, not only the current one). */
  stale?: string;
  nextAction: string;
  champion?: Creative;
  live: Creative[];
  submitted: Creative[];
  approved: Creative[];
  drafts: Creative[];
  backlog: Hypothesis[];
}

const since = (iso?: string) => (iso ? daysSince(iso) : 0);
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
  const noResults = live.filter((c) => !c.results || c.results.impressions === 0);
  const liveDays = since(live.map((c) => c.experiment?.startedAt).sort()[0]);

  // Staleness is checked everywhere a client can be waiting, whatever stage is shown.
  const stale: string[] = [];
  if (decided.length && since(decided[0].results?.updatedAt) > 2) stale.push("判定が出てから 2 日以上経過");
  if (submitted.length && since(newest(submitted)) > 3) stale.push(`${submitted.length} 案が提出から 3 日以上、返事なし。リマインドを`);
  if (approved.length && since(newest(approved)) > 2) stale.push(`${approved.length} 案が承認から 2 日以上、未配信`);
  if (live.length && noResults.length && liveDays > 3) stale.push("配信開始から 3 日以上、結果が未入力");
  if (live.length && !noResults.length && liveDays > 21) stale.push("3 週間判定が出ていない。差が小さい可能性");
  if (!live.length && !approved.length && !submitted.length && drafts.length && since(newest(drafts)) > 3) stale.push("下書きのまま 3 日以上");
  if (!live.length && !approved.length && !submitted.length && !drafts.length && champion && since(champion.experiment?.endedAt ?? champion.updatedAt) > 5) stale.push("挑戦者不在のまま 5 日以上");
  const first = stale[0];

  if (decided.length) {
    return { ...base, stage: "decided", daysInStage: since(decided[0].results?.updatedAt), stale: first, nextAction: "判定の出た挑戦者を昇格／終了し、学びを記録する" };
  }
  if (live.length) {
    const waiting = submitted.length ? `。確認待ち ${submitted.length} 案も追う` : approved.length ? `。承認済み ${approved.length} 案を入稿` : "";
    return { ...base, stage: "live", daysInStage: liveDays, stale: first, nextAction: (noResults.length ? "配信結果を取り込む" : "結果を更新しながら次の挑戦者を準備する") + waiting };
  }
  if (approved.length) {
    return { ...base, stage: "ready", daysInStage: since(newest(approved)), stale: first, nextAction: "書き出して入稿し、配信開始を押す" };
  }
  if (submitted.length) {
    return { ...base, stage: "awaiting_client", daysInStage: since(newest(submitted)), stale: first, nextAction: "クライアントの承認を待つ（3 日で催促）" };
  }
  if (drafts.length) {
    return { ...base, stage: "drafting", daysInStage: since(newest(drafts)), stale: first, nextAction: "辛口分析でふるい、2〜3 案を提出する" };
  }
  if (champion) {
    return { ...base, stage: "idle", daysInStage: since(champion.experiment?.endedAt ?? champion.updatedAt), stale: first, nextAction: backlog.length ? `バックログの「${backlog[0].title}」を案にする` : "仮説をバックログに追加し、挑戦者を作る" };
  }
  return { ...base, stage: "empty", daysInStage: since(brief.createdAt), nextAction: "候補を生成する" };
}
