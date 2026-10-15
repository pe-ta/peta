import "server-only";
import { normalizeAppeal, normalizeMotion, normalizeVisual, type AppealAxis, type Brief, type Creative, type Motion, type VisualAxis } from "./types";
import { generateCopy } from "./ai";
import { templateFor } from "./templates";
import { db, newId, nowIso } from "./store";

/**
 * Hypothesis grid expansion: hook x visual x motion -> creatives.
 * Copy is generated once per hook and shared across visual/motion cells,
 * so the experiment isolates layout and motion effects from wording.
 * The layout follows the hook (question / invitation / campaign / choice).
 */
export async function expandBrief(brief: Brief) {
  // Briefs saved before v0.4 may still carry legacy ids; map them and drop duplicates.
  const axes = [...new Set((brief.appealAxes.length ? brief.appealAxes : ["compatibility"]).map((a) => normalizeAppeal(a)))] as AppealAxis[];
  // A photo cell without a photo would only duplicate the art cell, so it is dropped up front.
  const requested = [...new Set((brief.visualAxes.length ? brief.visualAxes : ["art"]).map((v) => normalizeVisual(v)))] as VisualAxis[];
  const visuals = requested.filter((v) => v !== "photo" || brief.lpOgImage);
  if (visuals.length === 0) visuals.push("art");
  const motions = [...new Set((brief.motions.length ? brief.motions : ["static"]).map((m) => normalizeMotion(m)))] as Motion[];

  const { variants, source, note } = await generateCopy(brief, axes);
  const created: Creative[] = [];
  const ts = nowIso();

  for (const v of variants) {
    const options = v.options?.map((o) => o.trim()).filter(Boolean).slice(0, 3) ?? [];
    const template = templateFor(v.appealAxis, options.length >= 2);
    for (const visual of visuals) {
      // Invitation and choice layouts never show a photo: one cell is enough.
      if (visual === "photo" && !template.usesPhoto) continue;
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
            negative: template.id === "choice" ? undefined : v.negative || undefined,
            badge: v.badge || undefined,
            options: options.length >= 2 ? options : undefined,
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
  return { created, source, note };
}
