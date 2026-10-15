import type { Hypothesis, Learning } from "./types";

/**
 * North Star: hypotheses concluded per week. Weeks start on Monday in Japan time.
 * A conclusion is a learning with a result (won / lost / inconclusive), the record
 * concludeAction writes once per finished challenger.
 */

const DAY = 86_400_000;
const JST = 9 * 3_600_000;

/** Monday 00:00 JST of the week containing t, as a UTC timestamp. */
export function weekStart(t: number) {
  const local = t + JST;
  const day = new Date(local).getUTCDay(); // 0 = Sunday
  const monday = Math.floor(local / DAY) * DAY - ((day + 6) % 7) * DAY;
  return monday - JST;
}

export interface WeekBucket {
  start: string; // YYYY-MM-DD (JST Monday)
  won: number;
  lost: number;
  inconclusive: number;
  total: number;
}

export function weeklyConclusions(learnings: Pick<Learning, "createdAt" | "outcome">[], weeks = 8, now = Date.now()): WeekBucket[] {
  const current = weekStart(now);
  const buckets: WeekBucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const s = current - i * 7 * DAY;
    buckets.push({ start: new Date(s + JST).toISOString().slice(0, 10), won: 0, lost: 0, inconclusive: 0, total: 0 });
  }
  const first = current - (weeks - 1) * 7 * DAY;
  for (const l of learnings) {
    if (l.outcome === "note") continue;
    const t = new Date(l.createdAt).getTime();
    if (t < first) continue;
    const idx = Math.floor((weekStart(t) - first) / (7 * DAY));
    const b = buckets[idx];
    if (!b) continue;
    b[l.outcome]++;
    b.total++;
  }
  return buckets;
}

/** Median days from a hypothesis being written to its conclusion (concluded hypotheses only). */
export function medianCycleDays(hypotheses: Pick<Hypothesis, "status" | "createdAt" | "learningId">[], learnings: Pick<Learning, "id" | "createdAt">[]) {
  const at = new Map(learnings.map((l) => [l.id, l.createdAt]));
  const days = hypotheses
    .filter((h) => h.status === "concluded" && h.learningId && at.has(h.learningId))
    .map((h) => (new Date(at.get(h.learningId!)!).getTime() - new Date(h.createdAt).getTime()) / DAY)
    .filter((d) => d >= 0)
    .sort((a, b) => a - b);
  if (!days.length) return null;
  const m = Math.floor(days.length / 2);
  return days.length % 2 ? days[m] : (days[m - 1] + days[m]) / 2;
}
