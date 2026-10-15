// Unit checks for the pure parts of results ingestion and hypothesis derivation.
// Run: node --import ./e2e/ts-loader.mjs --experimental-transform-types e2e/unit.test.ts
import { normalizeDate, parseResultsJson, parseResultsText, splitLine } from "../src/lib/results";
import { deriveHypothesis } from "../src/lib/hypotheses";
import type { Creative, Hypothesis, Learning } from "../src/lib/types";

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
eq("dropped stays dropped", deriveHypothesis({ ...h, status: "dropped" }, [], [], {}).status, "dropped");

console.log(fail ? `unit: ${fail} failures` : "unit: all passed");
process.exitCode = fail ? 1 : 0;
