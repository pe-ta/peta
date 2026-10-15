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

// Deterministic PRNG (mulberry32) seeded from the inputs, so the same counts always give
// the same verdict: the button that enables promotion and the server guard must agree.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Marsaglia & Tsang gamma sampler -> Beta sampler.
function makeSamplers(rand: () => number) {
  const randn = () => {
    let u = 0;
    let v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const gamma = (shape: number): number => {
    if (shape < 1) return gamma(shape + 1) * Math.pow(rand(), 1 / shape);
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
      const u = rand();
      if (u < 1 - 0.0331 * x * x * x * x) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  };
  const beta = (a: number, b: number) => {
    const x = gamma(a);
    const y = gamma(b);
    return x / (x + y);
  };
  return { beta };
}

// Memo so a page that compares the same pair several times pays once.
const memo = new Map<string, Comparison>();

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
  const key = [metric, a1, b1, a2, b2, samples].join(":");
  const cached = memo.get(key);
  if (cached) return cached;
  const { beta } = makeSamplers(mulberry32((a1 * 73856093) ^ (b1 * 19349663) ^ (a2 * 83492791) ^ (b2 * 2654435761)));
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
  const result: Comparison = { pWin, expectedLoss, challengerRate: cr, championRate: pr, verdict, reason };
  if (memo.size > 500) memo.clear();
  memo.set(key, result);
  return result;
}

export function formatRate(r: number | null) {
  return r === null ? "—" : `${(r * 100).toFixed(2)}%`;
}

/**
 * Rough days-to-decision estimate for a running pair: impressions per arm needed to
 * separate the observed rates at 95% (two-proportion z, or a 20% relative lift when
 * the rates are still equal), divided by the recent daily impressions of the challenger.
 */
export function decisionEstimate(metric: WinMetric, challenger?: CreativeResults, champion?: CreativeResults, dailyImpressions?: number | null): { neededPerArm: number; days: number | null; note: string } {
  const pr = rate(metric, champion) ?? 0.03;
  const cr = rate(metric, challenger) ?? pr;
  const p = (pr + cr) / 2 || 0.03;
  const d = Math.max(Math.abs(cr - pr), p * 0.2);
  const z = 1.96 + 0.84; // alpha 5%, power 80%
  const needed = Math.ceil((z * z * 2 * p * (1 - p)) / (d * d));
  const have = Math.min(challenger?.impressions ?? 0, champion?.impressions ?? 0);
  const remaining = Math.max(0, needed - have);
  if (!dailyImpressions || dailyImpressions <= 0) return { neededPerArm: needed, days: null, note: `判定まで各案あと約 ${remaining.toLocaleString()} 表示` };
  const days = Math.ceil(remaining / dailyImpressions);
  return { neededPerArm: needed, days, note: days === 0 ? "判定に足る表示数に達しています" : `今のペース（1 日 ${Math.round(dailyImpressions).toLocaleString()} 表示）なら約 ${days} 日` };
}

/** Average daily impression gain over the last snapshots (cumulative values). */
export function dailyImpressionsFrom(snaps: Array<{ date: string; impressions: number }>) {
  const s = [...snaps].sort((a, b) => a.date.localeCompare(b.date));
  if (s.length < 2) return null;
  const first = s[0];
  const last = s[s.length - 1];
  const days = Math.max(1, (new Date(last.date).getTime() - new Date(first.date).getTime()) / 86_400_000);
  return Math.max(0, last.impressions - first.impressions) / days;
}

/** Whole days elapsed since an ISO timestamp (helper kept out of components for the purity lint). */
export function daysSince(iso: string) {
  return Math.max(0, (Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** Days from brief creation to the first creative going live. */
export function leadTimeDays(brief: Brief, creatives: Creative[]) {
  const starts = creatives.map((c) => c.experiment?.startedAt).filter(Boolean) as string[];
  if (!starts.length) return null;
  const first = starts.sort()[0];
  return Math.max(0, (new Date(first).getTime() - new Date(brief.createdAt).getTime()) / 86_400_000);
}
