import "server-only";
import { normalizeAppeal, normalizeMotion, normalizeVisual, type AppealAxis, type Brief, type Creative, type Hypothesis, type Motion, type VisualAxis } from "./types";
import { generateCopy } from "./ai";
import { resolveMotion, templateFor } from "./templates";
import { db, newId, nowIso } from "./store";
import { reconcileHypotheses } from "./hypotheses";

/**
 * Hypothesis grid expansion: hook x visual x motion -> creatives.
 * Copy is generated once per hook and shared across visual/motion cells,
 * so the experiment isolates layout and motion effects from wording.
 * The layout follows the hook (question / invitation / campaign / choice).
 */
export async function expandBrief(brief: Brief, opts?: { hypothesis?: Hypothesis }) {
  // Briefs saved before v0.4 may still carry legacy ids; map them and drop duplicates.
  const h = opts?.hypothesis;
  const axes = h ? [h.hook] : ([...new Set((brief.appealAxes.length ? brief.appealAxes : ["compatibility"]).map((a) => normalizeAppeal(a)))] as AppealAxis[]);
  // A photo cell without a photo would only duplicate the art cell, so it is dropped up front.
  const requested = [...new Set((brief.visualAxes.length ? brief.visualAxes : ["art"]).map((v) => normalizeVisual(v)))] as VisualAxis[];
  const visuals = requested.filter((v) => v !== "photo" || brief.lpOgImage);
  if (visuals.length === 0) visuals.push("art");
  const motions = [...new Set((brief.motions.length ? brief.motions : ["static"]).map((m) => normalizeMotion(m)))] as Motion[];

  const { variants, source, note } = await generateCopy(brief, axes, h ? { hypothesis: `${h.title}${h.rationale ? `（${h.rationale}）` : ""}` } : undefined);
  const created: Creative[] = [];
  const ts = nowIso();
  // Grid generation registers one hypothesis per hook so every draft belongs to the backlog.
  // A grid hypothesis for the same hook that has not been tested yet is reused, so regenerating does not pile up entries.
  const existing = h ? [] : await db.hypotheses.listByBrief(brief.id);
  const owners = new Map<string, Hypothesis>();

  for (const v of variants) {
    let owner = h;
    if (!owner) {
      owner = existing.find((x) => x.source === "grid" && x.hook === v.appealAxis && (x.status === "backlog" || x.status === "drafting"));
      if (owner) {
        owner.title = v.hypothesis;
        owner.rationale = v.rationale;
        owner.updatedAt = ts;
      } else {
        owner = { id: newId("hy"), briefId: brief.id, createdAt: ts, updatedAt: ts, title: v.hypothesis, rationale: v.rationale, hook: v.appealAxis, source: "grid", priority: 2, status: "drafting", creativeIds: [], author: "自動生成" };
      }
      await db.hypotheses.put(owner);
      owners.set(v.appealAxis, owner);
    }
    const options = v.options?.map((o) => o.trim()).filter(Boolean).slice(0, 3) ?? [];
    for (const visual of visuals) {
      const template = templateFor(v.appealAxis, { options: options.length, visual });
      // Invitation and choice layouts never show a photo: one cell is enough.
      if (visual === "photo" && !template.usesPhoto) continue;
      for (const requested of motions) {
        // Stacked options and tiles have no finger animation: cursor becomes blink, and the cell is not duplicated.
        const motion = resolveMotion(template.id, requested);
        if (motion !== requested && motions.includes(motion)) continue; // same cell already generated
        const creative: Creative = {
          id: newId("cr"),
          briefId: brief.id,
          createdAt: ts,
          updatedAt: ts,
          templateId: template.id,
          appealAxis: v.appealAxis,
          visualAxis: visual,
          motion,
          hypothesisId: owner.id,
          hypothesis: h ? h.title : v.hypothesis,
          rationale: h ? v.hypothesis : v.rationale,
          slots: {
            eyebrow: v.eyebrow,
            headline: v.headline,
            sub: v.sub,
            cta: v.cta,
            negative: template.id === "choice" || template.id === "tiles" ? undefined : v.negative || undefined,
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
  await reconcileHypotheses(brief.id, h ? [h.id] : [...owners.values()].map((o) => o.id));
  return { created, source, note };
}
