import { APPEAL_AXES, MOTIONS, VISUAL_AXES, normalizeAppeal, type AppealAxis, type Brief, type Hypothesis, type Learning, type Motion, type VisualAxis } from "./types";

/**
 * Next-hypothesis recommender.
 *
 * Ranks the hooks this client has not tried (or not yet concluded) by what has won elsewhere,
 * using a Beta(1,1) posterior on win / (win + loss) per hook, across all clients and within the
 * same industry (industry evidence counts double). Evidence-backed hooks come first; one slot is kept for a hook with little
 * or no evidence (ranked by an optimism bonus that shrinks with trials, UCB-style), so the
 * library keeps learning instead of only replaying the current favourite.
 */

export interface Tally {
  won: number;
  lost: number;
}

export interface Suggestion {
  hook: AppealAxis;
  visual: VisualAxis;
  motion: Motion;
  /** Posterior mean win rate after blending industry and overall evidence. */
  winRate: number;
  score: number;
  kind: "evidence" | "explore";
  overall: Tally;
  industry: Tally;
  reason: string;
}

const t0 = (): Tally => ({ won: 0, lost: 0 });

function add(t: Tally, outcome: Learning["outcome"]) {
  if (outcome === "won") t.won++;
  else if (outcome === "lost") t.lost++;
}

function best<T extends string>(m: Map<T, Tally>, fallback: T): T {
  let pick = fallback;
  let top = -1;
  for (const [k, t] of m) {
    const r = (1 + t.won) / (2 + t.won + t.lost);
    if (t.won + t.lost > 0 && r > top) {
      top = r;
      pick = k;
    }
  }
  return pick;
}

export function suggestNext(
  brief: Pick<Brief, "id" | "industry">,
  learnings: Array<Learning & { industry?: string }>,
  hypotheses: Pick<Hypothesis, "hook" | "status" | "outcome">[],
  limit = 3,
): Suggestion[] {
  // Hooks this client already has in play or has concluded are not suggested again.
  const taken = new Set(hypotheses.filter((h) => h.status !== "dropped").map((h) => normalizeAppeal(h.hook)));
  const overall = new Map<AppealAxis, Tally>();
  const industry = new Map<AppealAxis, Tally>();
  const visualBy = new Map<AppealAxis, Map<VisualAxis, Tally>>();
  const motionBy = new Map<AppealAxis, Map<Motion, Tally>>();
  let total = 0;
  for (const l of learnings) {
    if (!l.dna || (l.outcome !== "won" && l.outcome !== "lost")) continue;
    const hook = normalizeAppeal(l.dna.hook);
    total++;
    add(overall.get(hook) ?? overall.set(hook, t0()).get(hook)!, l.outcome);
    if (l.industry === brief.industry) add(industry.get(hook) ?? industry.set(hook, t0()).get(hook)!, l.outcome);
    const vm = visualBy.get(hook) ?? visualBy.set(hook, new Map()).get(hook)!;
    add(vm.get(l.dna.visual) ?? vm.set(l.dna.visual, t0()).get(l.dna.visual)!, l.outcome);
    const mm = motionBy.get(hook) ?? motionBy.set(hook, new Map()).get(hook)!;
    add(mm.get(l.dna.motion) ?? mm.set(l.dna.motion, t0()).get(l.dna.motion)!, l.outcome);
  }

  const out: Suggestion[] = [];
  for (const a of APPEAL_AXES) {
    if (taken.has(a.id)) continue;
    const o = overall.get(a.id) ?? t0();
    const i = industry.get(a.id) ?? t0();
    const won = o.won + i.won; // industry evidence counted twice
    const lost = o.lost + i.lost;
    const n = won + lost;
    const winRate = (1 + won) / (2 + n);
    const bonus = 0.35 * Math.sqrt(Math.log(total + 2) / (n + 1));
    const kind: Suggestion["kind"] = o.won + o.lost >= 2 ? "evidence" : "explore";
    const visual = best(visualBy.get(a.id) ?? new Map(), "art" as VisualAxis);
    const motion = best(motionBy.get(a.id) ?? new Map(), "static" as Motion);
    const parts: string[] = [];
    if (o.won + o.lost) parts.push(`全クライアントで ${o.won} 勝 ${o.lost} 敗`);
    if (i.won + i.lost) parts.push(`${brief.industry}で ${i.won} 勝 ${i.lost} 敗`);
    const combo = `${VISUAL_AXES.find((v) => v.id === visual)?.label ?? visual} × ${MOTIONS.find((m) => m.id === motion)?.label.replace(/（.*）/, "") ?? motion}`;
    const reason =
      kind === "explore"
        ? `${parts.length ? parts.join("、") + "。" : ""}まだ検証が少ないフック。勝ち筋を広げる探索枠`
        : `${parts.join("、")}。勝率の推定 ${Math.round(winRate * 100)}%。組み合わせは実績の良い ${combo}`;
    out.push({ hook: a.id, visual, motion, winRate, score: winRate + bonus, kind, overall: o, industry: i, reason });
  }
  out.sort((a, b) => b.score - a.score || a.hook.localeCompare(b.hook));
  // Evidence first (best first), then one exploration slot; more exploration only when evidence runs out.
  const evidence = out.filter((s) => s.kind === "evidence");
  const explore = out.filter((s) => s.kind === "explore");
  const nEvidence = Math.min(evidence.length, explore.length ? limit - 1 : limit);
  return [...evidence.slice(0, nEvidence), ...explore].slice(0, limit);
}
