import type { Brief, Creative, CreativeResults, WinMetric } from "./types";

/**
 * Bayesian comparison of conversion rates (Beta-Binomial) between a challenger
 * and the champion. Monte Carlo keeps it dependency-free and good enough for
 * the sample sizes popups see (hundreds to tens of thousands of impressions).
 */

export const MIN_IMPRESSIONS = 300;
export const WIN_THRESHOLD = 0.95;
export const LOSE_THRESHOLD = 0.05;

export function numerator(metric: WinMetric, r: CreativeResults) {
  return metric === "ctr" ? r.clicks : metric === "cvr" ? r.conversions : r.lineAdds;
}

export function rate(metric: WinMetric, r?: CreativeResults) {
  if (!r || r.impressions <= 0) return null;
  return numerator(metric, r) / r.impressions;
}

// Marsaglia & Tsang gamma sampler -> Beta sampler.
function randn() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function gamma(shape: number): number {
  if (shape < 1) return gamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = randn();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
function beta(a: number, b: number) {
  const x = gamma(a);
  const y = gamma(b);
  return x / (x + y);
}

export interface Comparison {
  /** P(challenger rate > champion rate) */
  pWin: number;
  /** Expected loss (in rate points) if we pick the challenger and it is actually worse. */
  expectedLoss: number;
  challengerRate: number | null;
  championRate: number | null;
  verdict: "won" | "lost" | "measuring" | "insufficient";
  reason: string;
}

export function compare(metric: WinMetric, challenger?: CreativeResults, champion?: CreativeResults, samples = 8000): Comparison {
  const cr = rate(metric, challenger);
  const pr = rate(metric, champion);
  if (!challenger || !champion || challenger.impressions < MIN_IMPRESSIONS || champion.impressions < MIN_IMPRESSIONS) {
    return {
      pWin: 0.5,
      expectedLoss: 0,
      challengerRate: cr,
      championRate: pr,
      verdict: "insufficient",
      reason: `表示 ${MIN_IMPRESSIONS} 回以上の計測が双方に必要`,
    };
  }
  const a1 = 1 + numerator(metric, challenger);
  const b1 = 1 + Math.max(0, challenger.impressions - numerator(metric, challenger));
  const a2 = 1 + numerator(metric, champion);
  const b2 = 1 + Math.max(0, champion.impressions - numerator(metric, champion));
  let wins = 0;
  let loss = 0;
  for (let i = 0; i < samples; i++) {
    const x = beta(a1, b1);
    const y = beta(a2, b2);
    if (x > y) wins++;
    else loss += y - x;
  }
  const pWin = wins / samples;
  const expectedLoss = loss / samples;
  let verdict: Comparison["verdict"] = "measuring";
  let reason = `勝つ確率 ${(pWin * 100).toFixed(0)}%。判定には 95% 以上（または 5% 以下）が必要`;
  if (pWin >= WIN_THRESHOLD) {
    verdict = "won";
    reason = `挑戦者が勝つ確率 ${(pWin * 100).toFixed(0)}%`;
  } else if (pWin <= LOSE_THRESHOLD) {
    verdict = "lost";
    reason = `挑戦者が勝つ確率 ${(pWin * 100).toFixed(0)}%。チャンピオンの維持`;
  }
  return { pWin, expectedLoss, challengerRate: cr, championRate: pr, verdict, reason };
}

export function formatRate(r: number | null) {
  return r === null ? "—" : `${(r * 100).toFixed(2)}%`;
}

/** Days from brief creation to the first creative going live. */
export function leadTimeDays(brief: Brief, creatives: Creative[]) {
  const starts = creatives.map((c) => c.experiment?.startedAt).filter(Boolean) as string[];
  if (!starts.length) return null;
  const first = starts.sort()[0];
  return Math.max(0, (new Date(first).getTime() - new Date(brief.createdAt).getTime()) / 86_400_000);
}
