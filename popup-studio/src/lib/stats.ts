import type { Brief, Creative, CreativeResults, ResultSnapshot, WinMetric } from "./types";

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

/* ------------------------------------------------------------------------------------------
 * Sequential (anytime-valid) decision.
 *
 * The Bayesian P(win) above is re-read every time results arrive. Checking a fixed 95% line
 * daily and stopping at the first crossing inflates false wins well past 5%. The verdict
 * therefore also requires a mixture sequential probability ratio test (mSPRT; Johari et al.,
 * "Always Valid Inference", 2017/2022) whose p-value stays valid however often it is looked
 * at. Every daily snapshot is one look; the p-value is the running minimum of 1 / likelihood
 * ratio over all looks, so it can only go down as evidence accumulates.
 * ---------------------------------------------------------------------------------------- */

export const SEQ_ALPHA = 0.05;

/** Mixture likelihood ratio for a difference in two proportions, normal prior N(0, tau^2) on the difference. */
function mixtureLR(metric: WinMetric, a: CreativeResults, b: CreativeResults): number | null {
  const n1 = a.impressions;
  const n2 = b.impressions;
  if (n1 <= 0 || n2 <= 0) return null;
  const x1 = Math.min(n1, numerator(metric, a));
  const x2 = Math.min(n2, numerator(metric, b));
  const pbar = (x1 + x2) / (n1 + n2);
  const v = pbar * (1 - pbar) * (1 / n1 + 1 / n2);
  if (!(v > 0)) return null;
  // Prior scale: a 30% relative lift is the effect size popups are designed to find.
  const tau2 = Math.max(0.3 * pbar, 0.002) ** 2;
  const theta = x1 / n1 - x2 / n2;
  return Math.sqrt(v / (v + tau2)) * Math.exp((tau2 * theta * theta) / (2 * v * (v + tau2)));
}

/** Always-valid p-value over a sequence of looks (cumulative challenger / champion counts). */
export function alwaysValidP(metric: WinMetric, looks: Array<[CreativeResults, CreativeResults]>) {
  let p = 1;
  for (const [a, b] of looks) {
    if (a.impressions < MIN_IMPRESSIONS || b.impressions < MIN_IMPRESSIONS) continue; // normal approximation needs some volume
    const lr = mixtureLR(metric, a, b);
    if (lr) p = Math.min(p, 1 / lr);
  }
  return p;
}

type Snap = Pick<ResultSnapshot, "creativeId" | "date" | "impressions" | "clicks" | "lineAdds" | "conversions">;

export interface Judgement extends Comparison {
  /** Always-valid p-value over every recorded look; null when there is nothing to test yet. */
  pSeq: number | null;
  /** concurrent: champion counted only from the challenger's launch. cumulative: no earlier champion snapshot to subtract. */
  window: "concurrent" | "cumulative";
  /** Champion counts actually compared (windowed when concurrent). */
  championWindow?: CreativeResults;
  /** Number of looks the sequential test has seen. */
  looks: number;
  /** Champion snapshot subtracted for the same-period comparison. */
  baseline?: Snap;
}

/** A champion's snapshots restated from the baseline on (same period as the challenger), for charts. */
export function windowedSnaps<T extends Snap>(snaps: T[], baseline?: Snap): T[] {
  if (!baseline) return snaps;
  return snaps
    .filter((s) => s.date > baseline.date)
    .map((s) => ({ ...s, impressions: Math.max(0, s.impressions - baseline.impressions), clicks: Math.max(0, s.clicks - baseline.clicks), lineAdds: Math.max(0, s.lineAdds - baseline.lineAdds), conversions: Math.max(0, s.conversions - baseline.conversions) }));
}

function jstDate(iso: string) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

function minus(r: Pick<CreativeResults, "impressions" | "clicks" | "lineAdds" | "conversions">, base: Snap | undefined, updatedAt: string): CreativeResults {
  return {
    impressions: Math.max(0, r.impressions - (base?.impressions ?? 0)),
    clicks: Math.max(0, r.clicks - (base?.clicks ?? 0)),
    lineAdds: Math.max(0, r.lineAdds - (base?.lineAdds ?? 0)),
    conversions: Math.max(0, r.conversions - (base?.conversions ?? 0)),
    updatedAt,
  };
}

/**
 * The verdict used everywhere (experiment table, next step, board, promotion guard).
 *
 * 1. Same period: the champion has usually run for weeks before the challenger arrives, and
 *    seasonality or traffic mix shifts between those periods. When a champion snapshot exists
 *    from before the challenger's first day, it is subtracted so both arms cover the same days.
 * 2. Bayesian P(win) gives the readable probability; the sequential p-value decides whether
 *    the result is final. Both must agree for "won" / "lost".
 */
export function judge(metric: WinMetric, challenger: Pick<Creative, "id" | "results" | "experiment">, champion: Pick<Creative, "id" | "results"> | null | undefined, snapshots: Snap[] = []): Judgement {
  const bySeq = (id: string) => snapshots.filter((s) => s.creativeId === id).sort((a, b) => a.date.localeCompare(b.date));
  const chSn = bySeq(challenger.id);
  const cpSn = champion ? bySeq(champion.id) : [];
  const starts = [challenger.experiment?.startedAt ? jstDate(challenger.experiment.startedAt) : null, chSn[0]?.date ?? null].filter((x): x is string => !!x).sort();
  const start = starts[0];
  const baseline = start ? cpSn.filter((s) => s.date < start).at(-1) : undefined;
  const championWindow = champion?.results ? (baseline ? minus(champion.results, baseline, champion.results.updatedAt) : champion.results) : undefined;

  const looks: Array<[CreativeResults, CreativeResults]> = [];
  for (const s of chSn) {
    const c = cpSn.filter((x) => x.date <= s.date && (!baseline || x.date > baseline.date)).at(-1);
    if (c) looks.push([minus(s, undefined, s.date), minus(c, baseline, c.date)]);
  }
  if (challenger.results && championWindow) looks.push([challenger.results, championWindow]);

  const cmp = compare(metric, challenger.results, championWindow);
  const pSeq = looks.length ? alwaysValidP(metric, looks) : null;
  const window = baseline ? "concurrent" : "cumulative";
  const base = { ...cmp, pSeq, window, championWindow, looks: looks.length, baseline } as Judgement;
  if (cmp.verdict !== "won" && cmp.verdict !== "lost") return base;
  const pText = pSeq === null ? "—" : pSeq < 0.001 ? "<0.001" : pSeq.toFixed(3);
  if (pSeq !== null && pSeq <= SEQ_ALPHA) return { ...base, reason: `${cmp.reason}（逐次検定 p=${pText}、確定）` };
  return {
    ...base,
    verdict: "measuring",
    reason: `勝つ確率 ${(cmp.pWin * 100).toFixed(0)}%。途中確認を重ねても有効な逐次検定ではまだ確定していません（p=${pText}、${SEQ_ALPHA * 100}% 以下で確定）`,
  };
}

/** Impressions per arm at which the sequential test would conclude if the given rates hold. */
export function sequentialSampleSize(metric: WinMetric, p1: number, p2: number) {
  const mk = (n: number, p: number): CreativeResults => {
    const x = Math.round(n * p);
    return { impressions: n, clicks: metric === "ctr" ? x : 0, lineAdds: metric === "line_add_rate" ? x : 0, conversions: metric === "cvr" ? x : 0, updatedAt: "" };
  };
  for (let n = MIN_IMPRESSIONS; n < 5e7; n = Math.ceil(n * 1.1)) {
    const lr = mixtureLR(metric, mk(n, p1), mk(n, p2));
    if (lr && 1 / lr <= SEQ_ALPHA) return n;
  }
  return Infinity;
}

export function formatRate(r: number | null) {
  return r === null ? "—" : `${(r * 100).toFixed(2)}%`;
}

/**
 * Days-to-decision estimate for a running pair: impressions per arm the sequential test needs
 * to conclude if the observed rates hold (or a 20% relative lift while they are still equal),
 * divided by the challenger's recent daily impressions.
 */
export function decisionEstimate(metric: WinMetric, challenger?: CreativeResults, champion?: CreativeResults, dailyImpressions?: number | null): { neededPerArm: number; days: number | null; note: string } {
  const pr = rate(metric, champion) ?? 0.03;
  const cr = rate(metric, challenger) ?? pr;
  const p = (pr + cr) / 2 || 0.03;
  const d = Math.max(Math.abs(cr - pr), p * 0.2);
  const needed = sequentialSampleSize(metric, Math.min(0.999, p + d / 2), Math.max(0.0001, p - d / 2));
  if (!Number.isFinite(needed)) return { neededPerArm: needed, days: null, note: "差が小さすぎて現実的な表示数では判定できません。結論なしで終了を検討" };
  const have = Math.min(challenger?.impressions ?? 0, champion?.impressions ?? 0);
  const remaining = Math.max(0, needed - have);
  if (!dailyImpressions || dailyImpressions <= 0) return { neededPerArm: needed, days: null, note: remaining === 0 ? "表示数は足りています。差が見込みより小さい可能性" : `判定まで各案あと約 ${remaining.toLocaleString()} 表示` };
  const days = Math.ceil(remaining / dailyImpressions);
  return { neededPerArm: needed, days, note: days === 0 ? "表示数は足りています。差が見込みより小さい可能性" : `今のペース（1 日 ${Math.round(dailyImpressions).toLocaleString()} 表示）なら約 ${days} 日` };
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
