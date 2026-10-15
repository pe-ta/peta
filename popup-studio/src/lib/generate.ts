import "server-only";
import type { AppealAxis, Brief, Creative, Motion, VisualAxis } from "./types";
import { generateCopy } from "./ai";
import { templateForHook } from "./templates";
import { db, newId, nowIso } from "./store";

/**
 * Hypothesis grid expansion: hook x visual x motion -> creatives.
 * Copy is generated once per hook and shared across visual/motion cells,
 * so the experiment isolates layout and motion effects from wording.
 * The layout follows the hook (question / invitation / campaign / choice).
 */
export async function expandBrief(brief: Brief) {
  const axes = brief.appealAxes.length ? brief.appealAxes : (["compatibility"] as AppealAxis[]);
  const visuals = brief.visualAxes.length ? brief.visualAxes : (["art"] as VisualAxis[]);
  const motions = brief.motions.length ? brief.motions : (["static"] as Motion[]);

  const { variants, source, note } = await generateCopy(brief, axes);
  const created: Creative[] = [];
  const ts = nowIso();

  for (const v of variants) {
    const template = templateForHook(v.appealAxis);
    for (const visual of visuals) {
      // A photo cell without a photo would duplicate the art cell: skip it.
      if (visual === "photo" && !brief.lpOgImage) continue;
      for (const motion of motions) {
        const creative: Creative = {
          id: newId("cr"),
          briefId: brief.id,
          createdAt: ts,
          updatedAt: ts,
          templateId: template.id,
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
            negative: v.negative || undefined,
            badge: v.badge || undefined,
            options: v.options?.length ? v.options : undefined,
            imageUrl: visual === "photo" ? brief.lpOgImage : undefined,
          },
          status: "draft",
          version: 1,
        };
        await db.creatives.put(creative);
        created.push(creative);
      }
    }
  }
  // If every visual cell was skipped (photo requested, no image), fall back to art once.
  if (created.length === 0 && visuals.length) {
    const b: Brief = { ...brief, visualAxes: ["art"] };
    return expandBrief(b);
  }
  return { created, source, note };
}
