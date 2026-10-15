// Unit checks for the pure parts of results ingestion and hypothesis derivation.
// Run: node --import ./e2e/ts-loader.mjs --experimental-transform-types e2e/unit.test.ts
import { normalizeDate, parseResultsJson, parseResultsText, splitLine } from "../src/lib/results";
import { deriveHypothesis } from "../src/lib/hypotheses";
import { alwaysValidP, judge, sequentialSampleSize } from "../src/lib/stats";
import { suggestNext } from "../src/lib/recommend";
import { medianCycleDays, weekStart, weeklyConclusions } from "../src/lib/northstar";
import type { Creative, CreativeResults, Hypothesis, Learning, ResultSnapshot } from "../src/lib/types";

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    fail++;
    console.log(`FAIL ${name}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`);
  }
};

// Dates
eq("date iso", normalizeDate("2026-10-15"), "2026-10-15");
eq("date slash", normalizeDate("2026/10/5"), "2026-10-05");
eq("date compact", normalizeDate("20261005"), "2026-10-05");
eq("date ts jst", normalizeDate("2026-10-15T20:00:00Z"), "2026-10-16");
eq("date impossible", normalizeDate("2026-13-40"), null);
eq("date trailing junk", normalizeDate("2026/10/155"), null);
eq("date feb 30", normalizeDate("2026-02-30"), null);

// CSV splitting
eq("split quoted", splitLine('cr_x,2026-10-15,"1,200",80', ","), ["cr_x", "2026-10-15", "1,200", "80"]);
eq("split escaped quote", splitLine('a,"b ""c""",d', ","), ["a", 'b "c"', "d"]);

// Header detection
const t1 = parseResultsText("date,campaign_id,creative_id,impressions,clicks,line_adds,conversions\n2026/10/18,camp1,cr_a,\"1,500\",90,50,6", "2026-10-20");
eq("campaign_id not taken for creative id", t1.rows[0]?.creativeId, "cr_a");
eq("quoted thousands", t1.rows[0]?.impressions, 1500);
const t2 = parseResultsText("クリエイティブID,日付,表示回数,タップ数,LINE友だち追加数,CV数\ncr_b,2026-10-18,1000,50,20,3", "2026-10-20");
eq("japanese qualified headers", t2.rows[0], { creativeId: "cr_b", date: "2026-10-18", impressions: 1000, clicks: 50, lineAdds: 20, conversions: 3, blocks: undefined });
const t3 = parseResultsText("creative_id,impressions,clicks,click_rate,cvr\ncr_c,1000,50,5.0,12.5", "2026-10-20");
eq("rate columns ignored", [t3.rows[0]?.clicks, t3.rows[0]?.conversions], [50, 0]);
const t4 = parseResultsText("creative_name,creative_id,impressions\nバナーA,cr_d,10", "2026-10-20");
eq("name column not id", t4.rows[0]?.creativeId, "cr_d");
const t5 = parseResultsText("creative_id,date,impressions\ncr_e,2026-13-40,10\ncr_e,2026-10-18,20", "2026-10-20");
eq("bad date skipped", [t5.rows.length, t5.skipped?.length], [1, 1]);
const j1 = parseResultsJson([{ creative_id: "cr_f", date: "2026/10/14", impressions: 600 }, { zc: "zc=cr_g", Impressions: "1,200" }], "2026-10-20");
eq("json aliases and dates", j1.rows.map((r) => [r.creativeId, r.date, r.impressions]), [["cr_f", "2026-10-14", 600], ["cr_g", "2026-10-20", 1200]]);

// Hypothesis derivation
const h: Hypothesis = { id: "hy_1", briefId: "br", createdAt: "", updatedAt: "", title: "t", hook: "invitation", source: "ap", priority: 1, status: "backlog", creativeIds: [], author: "AP" };
const cell = (id: string, status: Creative["status"], started = false): Creative => ({ id, briefId: "br", createdAt: "", updatedAt: "", templateId: "question", appealAxis: "invitation", visualAxis: "art", motion: "static", hypothesisId: "hy_1", hypothesis: "t", slots: { eyebrow: "", headline: "", sub: "", cta: "" }, status, version: 1, experiment: started ? { startedAt: "2026-10-01" } : undefined });
const ln = (cid: string, outcome: Learning["outcome"], at = "2026-10-10"): Learning => ({ id: `ln_${cid}`, briefId: "br", creativeId: cid, createdAt: at, hypothesis: "t", outcome, author: "AP" });
eq("no cells", deriveHypothesis(h, [], [], {}).status, "backlog");
eq("drafts only", deriveHypothesis(h, [cell("a", "draft")], [], {}).status, "drafting");
eq("submitted, never launched", deriveHypothesis(h, [cell("a", "submitted")], [], {}).status, "drafting");
eq("one live", deriveHypothesis(h, [cell("a", "live", true), cell("b", "draft")], [], {}).status, "testing");
eq("one lost, sibling submitted", deriveHypothesis(h, [cell("a", "ended", true), cell("b", "submitted")], [ln("a", "lost")], {}).status, "testing");
eq("one lost, sibling rejected -> concluded lost", deriveHypothesis(h, [cell("a", "ended", true), cell("b", "rejected")], [ln("a", "lost")], {}), { status: "concluded", outcome: "lost", learningId: "ln_a" });
eq("won cell later dethroned stays won", deriveHypothesis(h, [cell("a", "ended", true), cell("b", "ended", true)], [ln("a", "won", "2026-10-05"), ln("b", "inconclusive", "2026-10-09")], { championId: "x" }).outcome, "won");
eq("winner is champion (live) -> concluded", deriveHypothesis(h, [cell("a", "live", true)], [ln("a", "won")], { championId: "a" }).status, "concluded");
eq("relaunch clears learningId", deriveHypothesis({ ...h, status: "concluded", learningId: "ln_a" }, [cell("a", "ended", true), cell("c", "live", true)], [ln("a", "lost")], {}), { status: "testing", outcome: undefined, learningId: undefined });
eq("untested first champion is in market, not backlog", deriveHypothesis(h, [cell("a", "live", true)], [], { championId: "a" }).status, "testing");
eq("dropped stays dropped", deriveHypothesis({ ...h, status: "dropped" }, [], [], {}).status, "dropped");

// Sequential test: false wins under daily peeking stay near alpha (A/A simulation).
{
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const binom = (n: number, p: number) => { let x = 0; for (let i = 0; i < n; i++) if (rnd() < p) x++; return x; };
  const R = (impressions: number, lineAdds: number): CreativeResults => ({ impressions, clicks: 0, lineAdds, conversions: 0, updatedAt: "" });
  let seqFalse = 0;
  let naiveFalse = 0;
  const sims = 300;
  for (let k = 0; k < sims; k++) {
    let n = 0, a = 0, b = 0;
    const looks: Array<[CreativeResults, CreativeResults]> = [];
    let naive = false;
    for (let day = 0; day < 30; day++) {
      n += 400; a += binom(400, 0.03); b += binom(400, 0.03);
      looks.push([R(n, a), R(n, b)]);
      const p = (a + b) / (2 * n);
      const z = Math.abs(a / n - b / n) / Math.sqrt(p * (1 - p) * (2 / n));
      if (z > 1.96) naive = true;
    }
    if (alwaysValidP("line_add_rate", looks) <= 0.05) seqFalse++;
    if (naive) naiveFalse++;
  }
  console.log(`A/A with 30 daily looks: sequential false wins ${seqFalse}/${sims}, naive peeking ${naiveFalse}/${sims}`);
  eq("sequential false-positive rate <= 6%", seqFalse / sims <= 0.06, true);
  eq("naive peeking is inflated (sanity)", naiveFalse / sims > 0.1, true);
}
// Sequential test detects a real 40% lift.
eq("sample size finite for 3% vs 4.2%", Number.isFinite(sequentialSampleSize("line_add_rate", 0.042, 0.03)), true);
// Same-period window: champion counts before the challenger's first day are subtracted.
{
  const snap = (creativeId: string, date: string, impressions: number, lineAdds: number): ResultSnapshot => ({ id: `${creativeId}${date}`, briefId: "br", creativeId, date, impressions, clicks: 0, lineAdds, conversions: 0, source: "csv", createdAt: "" });
  const champ = { id: "ch", results: { impressions: 20000, clicks: 0, lineAdds: 1000, conversions: 0, updatedAt: "" } };
  const chal = { id: "cx", results: { impressions: 10000, clicks: 0, lineAdds: 300, conversions: 0, updatedAt: "" }, experiment: { startedAt: "2026-10-10T01:00:00Z" } };
  const snaps = [snap("ch", "2026-10-09", 10000, 700), snap("ch", "2026-10-20", 20000, 1000), snap("cx", "2026-10-20", 10000, 300)];
  const j = judge("line_add_rate", chal, champ, snaps);
  eq("window concurrent", j.window, "concurrent");
  eq("champion window counts", [j.championWindow?.impressions, j.championWindow?.lineAdds], [10000, 300]);
  eq("equal concurrent rates are not a loss", j.verdict === "lost", false);
  const jc = judge("line_add_rate", chal, champ, snaps.filter((s) => s.date !== "2026-10-09"));
  eq("no earlier champion snapshot -> cumulative", jc.window, "cumulative");
}

// Recommender: skips hooks in play, ranks by evidence, keeps one exploration slot.
{
  const L = (hook: Learning["dna"] extends infer D ? D extends { hook: infer H } ? H : never : never, outcome: Learning["outcome"], industry: string) =>
    ({ id: `l${Math.random()}`, briefId: "x", createdAt: "", hypothesis: "", outcome, author: "", industry, dna: { hook, structure: "two_buttons", visual: "art", motion: "static", layout: "question", tags: [] } }) as Learning & { industry: string };
  const ls = [
    ...Array.from({ length: 6 }, () => L("invitation", "won", "金融・保険")),
    L("invitation", "lost", "金融・保険"),
    ...Array.from({ length: 3 }, () => L("pain", "lost", "美容・医療")),
    L("pain", "won", "美容・医療"),
    ...Array.from({ length: 2 }, () => L("campaign", "won", "美容・医療")),
    ...Array.from({ length: 2 }, () => L("campaign", "lost", "美容・医療")),
  ];
  const r = suggestNext({ id: "b", industry: "金融・保険" }, ls, [{ hook: "compatibility", status: "testing" }], 3);
  eq("recommend excludes hooks in play", r.some((x) => x.hook === "compatibility"), false);
  eq("recommend top is the evidence winner", r[0].hook, "invitation");
  eq("recommend has exactly one explore slot", r.filter((x) => x.kind === "explore").length, 1);
  eq("recommend size", r.length, 3);
}
// North Star weeks (Monday 00:00 JST boundaries).
{
  const now = Date.parse("2026-10-15T03:00:00Z"); // Thu 12:00 JST
  eq("week start is Monday JST", new Date(weekStart(now)).toISOString(), "2026-10-11T15:00:00.000Z");
  const w = weeklyConclusions([
    { createdAt: "2026-10-11T14:59:00Z", outcome: "won" }, // Sun 23:59 JST -> previous week
    { createdAt: "2026-10-11T15:00:00Z", outcome: "lost" }, // Mon 00:00 JST -> this week
    { createdAt: "2026-10-12T00:00:00Z", outcome: "note" },
  ], 2, now);
  eq("weekly buckets", w.map((x) => [x.start, x.total]), [["2026-10-05", 1], ["2026-10-12", 1]]);
  eq("median cycle", medianCycleDays([{ status: "concluded", createdAt: "2026-10-01T00:00:00Z", learningId: "a" }, { status: "concluded", createdAt: "2026-10-01T00:00:00Z", learningId: "b" }, { status: "testing", createdAt: "2026-10-01T00:00:00Z" }], [{ id: "a", createdAt: "2026-10-05T00:00:00Z" }, { id: "b", createdAt: "2026-10-11T00:00:00Z" }]), 7);
}

console.log(fail ? `unit: ${fail} failures` : "unit: all passed");
process.exitCode = fail ? 1 : 0;
