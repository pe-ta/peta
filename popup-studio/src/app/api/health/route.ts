import { db, getStore } from "@/lib/store";
import { runPreflight } from "@/lib/preflight";
import { dnaOf } from "@/lib/dna";
import { LIBRARY_META, findSimilar } from "@/lib/library";
import { renderCreative } from "@/lib/render";
import { aiProviderName } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Diagnostics for production incidents: runs each subsystem against the live
 * data and reports timings and error messages as JSON instead of a blank 500.
 * No secrets are echoed; only booleans for configuration.
 */
export async function GET() {
  const t0 = Date.now();
  const report: Record<string, unknown> = {
    version: "0.4",
    node: process.version,
    db: getStore().durable ? "postgres" : "memory",
    ai: aiProviderName() ?? "none",
    library: LIBRARY_META.count,
  };
  const step = async (name: string, fn: () => Promise<unknown>) => {
    const t = Date.now();
    try {
      const v = await fn();
      report[name] = { ok: true, ms: Date.now() - t, value: v };
    } catch (err) {
      report[name] = { ok: false, ms: Date.now() - t, error: err instanceof Error ? `${err.name}: ${err.message}` : String(err), stack: err instanceof Error ? err.stack?.split("\n").slice(0, 4) : undefined };
    }
  };
  const briefs = await (async () => {
    try {
      return await db.briefs.list();
    } catch {
      return [];
    }
  })();
  await step("briefs", async () => briefs.length);
  await step("learnings", async () => (await db.learnings.list()).length);
  const sample = briefs[0];
  if (sample) {
    await step("creatives", async () => (await db.creatives.listByBrief(sample.id)).length);
    await step("similar", async () => findSimilar(sample, undefined, 3).map((e) => e.headline));
    const creatives = await db.creatives.listByBrief(sample.id).catch(() => []);
    const c = creatives[0];
    if (c) {
      await step("preflight", async () => runPreflight(sample, c).score);
      await step("dna", async () => dnaOf(c));
      await step("render", async () => {
        const r = await renderCreative(sample, c, { format: "png", scale: 0.25 });
        return { bytes: r.bytes.byteLength, width: r.width, height: r.height, degraded: r.degraded };
      });
    }
  }
  // Every brief, the way the board and brief pages read them: surfaces data-shape problems per document.
  await step("allBriefs", async () => {
    const problems: string[] = [];
    for (const b of briefs) {
      try {
        const cs = await db.creatives.listByBrief(b.id);
        for (const c of cs) {
          try {
            runPreflight(b, c);
            dnaOf(c);
          } catch (err) {
            problems.push(`${b.id}/${c.id}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      } catch (err) {
        problems.push(`${b.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return { briefs: briefs.length, problems };
  });
  report.totalMs = Date.now() - t0;
  return Response.json(report, { headers: { "cache-control": "no-store" } });
}
