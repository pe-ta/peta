import "server-only";
import { db, nowIso } from "./store";
import type { Brief, Creative, Hypothesis, Learning } from "./types";

/**
 * A hypothesis expands into several creatives (visual x motion cells). Its status and
 * outcome are derived from those cells and their learnings, never set piecemeal by
 * individual actions, so rejection, deletion, relaunch and dethroning all stay consistent.
 *
 *   no cells                         -> backlog (or stays dropped)
 *   any cell live (not champion), approved or submitted -> testing if any cell has ever gone live, else drafting
 *   only drafts / rejected           -> drafting (or testing if a cell already concluded)
 *   every launched cell concluded    -> concluded; won if any cell's conclusion learning was a win
 */
export function deriveHypothesis(h: Hypothesis, cells: Creative[], learnings: Learning[], brief: Pick<Brief, "championId">): Pick<Hypothesis, "status" | "outcome" | "learningId"> {
  const cellIds = new Set(cells.map((c) => c.id));
  // The conclusion record for each cell is its learning, written once by concludeAction.
  // A dethroned champion's experiment.outcome is later overwritten to "lost"; the learning is not.
  const results = learnings.filter((l) => l.creativeId && cellIds.has(l.creativeId) && l.outcome !== "note").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const inFlight = cells.some((c) => (c.status === "live" && c.id !== brief.championId) || c.status === "approved" || c.status === "submitted");
  const everLaunched = cells.some((c) => c.experiment?.startedAt);
  const drafts = cells.some((c) => ["draft", "reviewing", "rejected"].includes(c.status));

  if (cells.length === 0) return { status: h.status === "dropped" ? "dropped" : "backlog", outcome: undefined, learningId: undefined };
  if (inFlight) return { status: everLaunched || results.length ? "testing" : "drafting", outcome: undefined, learningId: undefined };
  if (results.length) {
    const outcome = results.some((l) => l.outcome === "won") ? "won" : results.some((l) => l.outcome === "lost") ? "lost" : "inconclusive";
    return { status: "concluded", outcome, learningId: results[results.length - 1].id };
  }
  if (h.status === "dropped") return { status: "dropped", outcome: undefined, learningId: undefined };
  return { status: drafts ? "drafting" : "backlog", outcome: undefined, learningId: undefined };
}

/** Recompute every hypothesis of a brief (or only the given ids) and persist changes. */
export async function reconcileHypotheses(briefId: string, onlyIds?: Array<string | undefined>) {
  const wanted = onlyIds ? new Set(onlyIds.filter(Boolean) as string[]) : null;
  const hs = (await db.hypotheses.listByBrief(briefId)).filter((h) => !wanted || wanted.has(h.id));
  if (!hs.length) return;
  const [brief, creatives, learnings] = await Promise.all([db.briefs.get(briefId), db.creatives.listByBrief(briefId), db.learnings.listByBrief(briefId)]);
  if (!brief) return;
  for (const h of hs) {
    const cells = creatives.filter((c) => c.hypothesisId === h.id);
    const next = deriveHypothesis(h, cells, learnings, brief);
    const ids = cells.map((c) => c.id);
    const changed = next.status !== h.status || next.outcome !== h.outcome || next.learningId !== h.learningId || ids.join() !== h.creativeIds.join();
    if (!changed) continue;
    Object.assign(h, next, { creativeIds: ids, updatedAt: nowIso() });
    await db.hypotheses.put(h);
  }
}
