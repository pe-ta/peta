import "server-only";
import type { AppealAxis, Brief, Creative, Motion, VisualAxis } from "./types";
import { generateCopy } from "./ai";
import { templateForVisual } from "./templates";
import { db, newId, nowIso } from "./store";

/**
 * Hypothesis grid expansion: appeal axis x visual axis x motion -> creatives.
 * Copy is generated once per appeal axis and shared across visual/motion cells,
 * so the experiment isolates layout and motion effects from wording.
 */
export async function expandBrief(brief: Brief) {
  const axes = brief.appealAxes.length ? brief.appealAxes : (["benefit"] as AppealAxis[]);
  const visuals = brief.visualAxes.length ? brief.visualAxes : (["text"] as VisualAxis[]);
  const motions = brief.motions.length ? brief.motions : (["static"] as Motion[]);

  const { variants, source, note } = await generateCopy(brief, axes);
  const created: Creative[] = [];
  const ts = nowIso();

  for (const v of variants) {
    for (const visual of visuals) {
      for (const motion of motions) {
        const creative: Creative = {
          id: newId("cr"),
          briefId: brief.id,
          createdAt: ts,
          updatedAt: ts,
          templateId: templateForVisual(visual).id,
          appealAxis: v.appealAxis,
          visualAxis: visual,
          motion,
          hypothesis: v.hypothesis,
          rationale: v.rationale,
          slots: {
            eyebrow: v.eyebrow,
            headline: v.headline,
            sub: v.sub,
            cta: v.cta,
            badge: v.badge || undefined,
            imageUrl: visual === "image" ? brief.lpOgImage : undefined,
          },
          status: "draft",
          version: 1,
        };
        await db.creatives.put(creative);
        created.push(creative);
      }
    }
  }
  return { created, source, note };
}
