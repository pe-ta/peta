"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, newId, nowIso } from "./store";
import { extractLp } from "./lp-extract";
import { expandBrief } from "./generate";
import { normalizeHex, readableOn } from "./color";
import { verifyReviewToken } from "./review-token";
import { critiqueCreative } from "./critique";
import { compare, formatRate } from "./stats";
import { WIN_METRICS } from "./types";
import type { AppealAxis, Brief, CreativeStatus, Learning, Motion, RejectReason, Review, VisualAxis, WinMetric } from "./types";

function str(fd: FormData, key: string, fallback = "") {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : fallback;
}
function list<T extends string>(fd: FormData, key: string): T[] {
  return fd.getAll(key).filter((v): v is string => typeof v === "string") as T[];
}

export async function createBriefAction(formData: FormData) {
  const lpUrl = str(formData, "lpUrl");
  const lp = lpUrl ? await extractLp(lpUrl) : { colors: [], headings: [] };
  const primary = normalizeHex(str(formData, "primary") || lp.colors[0] || "#0b6e4f");
  const accent = normalizeHex(str(formData, "accent") || lp.colors[1] || "#e5484d");
  const background = normalizeHex(str(formData, "background") || "#ffffff");

  const brief: Brief = {
    id: newId("br"),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    winMetric: (WIN_METRICS.some((m) => m.id === str(formData, "winMetric")) ? str(formData, "winMetric") : "line_add_rate") as WinMetric,
    clientName: str(formData, "clientName", "無題のクライアント"),
    industry: str(formData, "industry", "その他"),
    lpUrl,
    lpTitle: lp.title,
    lpDescription: lp.description,
    lpOgImage: lp.ogImage,
    offer: str(formData, "offer"),
    target: str(formData, "target"),
    exitContext: str(formData, "exitContext"),
    deviceSize: (str(formData, "deviceSize") === "pc" ? "pc" : "sp"),
    brand: {
      primary,
      accent,
      background,
      text: readableOn(background) === "#ffffff" ? "#ffffff" : "#1a1a1a",
      logoText: str(formData, "logoText") || str(formData, "clientName", ""),
      ngWords: str(formData, "ngWords").split(/[、,\n]/).map((s) => s.trim()).filter(Boolean),
      tone: str(formData, "tone", "信頼感があり、親しみやすい"),
    },
    appealAxes: list<AppealAxis>(formData, "appealAxes"),
    visualAxes: list<VisualAxis>(formData, "visualAxes"),
    motions: list<Motion>(formData, "motions"),
    notes: str(formData, "notes") || undefined,
    copySource: "fallback",
  };

  await db.briefs.put(brief);
  const { source } = await expandBrief(brief);
  brief.copySource = source;
  await db.briefs.put(brief);
  redirect(`/briefs/${brief.id}`);
}

export async function regenerateAction(formData: FormData) {
  const briefId = str(formData, "briefId");
  const brief = await db.briefs.get(briefId);
  if (!brief) return;
  const existing = await db.creatives.listByBrief(briefId);
  for (const c of existing) if (c.status === "draft") await db.creatives.delete(c.id);
  const { source } = await expandBrief(brief);
  brief.copySource = source;
  brief.updatedAt = nowIso();
  await db.briefs.put(brief);
  revalidatePath(`/briefs/${briefId}`);
}

export async function updateCreativeAction(formData: FormData) {
  const id = str(formData, "creativeId");
  const creative = await db.creatives.get(id);
  if (!creative) return;
  creative.slots = {
    eyebrow: str(formData, "eyebrow"),
    headline: str(formData, "headline"),
    sub: str(formData, "sub"),
    cta: str(formData, "cta"),
    badge: str(formData, "badge") || undefined,
    imageUrl: str(formData, "imageUrl") || undefined,
    primary: str(formData, "primary") ? normalizeHex(str(formData, "primary")) : undefined,
    accent: str(formData, "accent") ? normalizeHex(str(formData, "accent")) : undefined,
  };
  creative.hypothesis = str(formData, "hypothesis", creative.hypothesis);
  const motion = str(formData, "motion") as Motion;
  if (["static", "pop", "slide", "pulse"].includes(motion)) creative.motion = motion;
  creative.version += 1;
  creative.updatedAt = nowIso();
  await db.creatives.put(creative);
  revalidatePath(`/creatives/${id}`);
  revalidatePath(`/briefs/${creative.briefId}`);
}

export async function setStatusAction(formData: FormData) {
  const id = str(formData, "creativeId");
  const status = str(formData, "status") as CreativeStatus;
  const creative = await db.creatives.get(id);
  if (!creative) return;
  creative.status = status;
  creative.updatedAt = nowIso();
  await db.creatives.put(creative);
  revalidatePath(`/briefs/${creative.briefId}`);
  revalidatePath(`/creatives/${id}`);
}

export async function submitForReviewAction(formData: FormData) {
  const briefId = str(formData, "briefId");
  const ids = list<string>(formData, "creativeIds");
  for (const id of ids) {
    const c = await db.creatives.get(id);
    if (!c || c.briefId !== briefId) continue;
    c.status = "submitted";
    c.updatedAt = nowIso();
    await db.creatives.put(c);
  }
  revalidatePath(`/briefs/${briefId}`);
}

export async function deleteCreativeAction(formData: FormData) {
  const id = str(formData, "creativeId");
  const creative = await db.creatives.get(id);
  if (!creative) return;
  await db.creatives.delete(id);
  revalidatePath(`/briefs/${creative.briefId}`);
  redirect(`/briefs/${creative.briefId}`);
}

// Experiment loop -----------------------------------------------------------

export async function critiqueAction(formData: FormData) {
  const id = str(formData, "creativeId");
  const creative = await db.creatives.get(id);
  if (!creative) return;
  const brief = await db.briefs.get(creative.briefId);
  if (!brief) return;
  const champion = brief.championId ? await db.creatives.get(brief.championId) : null;
  creative.critique = await critiqueCreative(brief, creative, champion ?? undefined);
  creative.updatedAt = nowIso();
  await db.creatives.put(creative);
  revalidatePath(`/creatives/${id}`);
  revalidatePath(`/briefs/${creative.briefId}`);
}

export async function critiqueAllAction(formData: FormData) {
  const briefId = str(formData, "briefId");
  const brief = await db.briefs.get(briefId);
  if (!brief) return;
  const creatives = await db.creatives.listByBrief(briefId);
  const champion = brief.championId ? creatives.find((c) => c.id === brief.championId) : undefined;
  const targets = creatives.filter((c) => !c.critique && c.status !== "ended");
  // Sequential on purpose: keeps API concurrency low on serverless.
  for (const c of targets) {
    c.critique = await critiqueCreative(brief, c, champion);
    c.updatedAt = nowIso();
    await db.creatives.put(c);
  }
  revalidatePath(`/briefs/${briefId}`);
}

export async function startExperimentAction(formData: FormData) {
  const id = str(formData, "creativeId");
  const creative = await db.creatives.get(id);
  if (!creative) return;
  const brief = await db.briefs.get(creative.briefId);
  if (!brief) return;
  creative.status = "live";
  creative.experiment = { startedAt: nowIso() };
  creative.results ??= { impressions: 0, clicks: 0, lineAdds: 0, conversions: 0, updatedAt: nowIso() };
  creative.updatedAt = nowIso();
  await db.creatives.put(creative);
  // First live creative becomes the champion (the control) automatically.
  if (!brief.championId) {
    brief.championId = creative.id;
    brief.updatedAt = nowIso();
    await db.briefs.put(brief);
  }
  revalidatePath(`/briefs/${creative.briefId}`);
  revalidatePath(`/creatives/${id}`);
  revalidatePath("/");
}

export async function saveResultsAction(formData: FormData) {
  const id = str(formData, "creativeId");
  const creative = await db.creatives.get(id);
  if (!creative) return;
  const num = (k: string) => Math.max(0, Math.round(Number(str(formData, k, "0")) || 0));
  creative.results = {
    impressions: num("impressions"),
    clicks: num("clicks"),
    lineAdds: num("lineAdds"),
    conversions: num("conversions"),
    blocks: num("blocks") || undefined,
    updatedAt: nowIso(),
  };
  creative.updatedAt = nowIso();
  await db.creatives.put(creative);
  revalidatePath(`/briefs/${creative.briefId}`);
  revalidatePath("/");
}

/** Conclude a challenger: promote to champion (won) or retire it (lost / inconclusive). Writes a learning entry. */
export async function concludeAction(formData: FormData) {
  const id = str(formData, "creativeId");
  const outcome = str(formData, "outcome") as "won" | "lost" | "inconclusive";
  if (!["won", "lost", "inconclusive"].includes(outcome)) return;
  const creative = await db.creatives.get(id);
  if (!creative) return;
  const brief = await db.briefs.get(creative.briefId);
  if (!brief) return;
  const champion = brief.championId ? await db.creatives.get(brief.championId) : null;
  const cmp = compare(brief.winMetric, creative.results, champion?.results);
  const metricLabel = WIN_METRICS.find((m) => m.id === brief.winMetric)?.label ?? brief.winMetric;
  const evidence = `${metricLabel} ${formatRate(cmp.challengerRate)} vs チャンピオン ${formatRate(cmp.championRate)}（勝つ確率 ${(cmp.pWin * 100).toFixed(0)}%）`;

  creative.experiment = { ...(creative.experiment ?? { startedAt: nowIso() }), endedAt: nowIso(), outcome };
  if (outcome === "won") {
    creative.status = "live";
    if (champion && champion.id !== creative.id) {
      champion.status = "ended";
      champion.experiment = { ...(champion.experiment ?? { startedAt: nowIso() }), endedAt: nowIso(), outcome: "lost" };
      champion.updatedAt = nowIso();
      await db.creatives.put(champion);
    }
    brief.championId = creative.id;
    brief.updatedAt = nowIso();
    await db.briefs.put(brief);
  } else {
    creative.status = "ended";
  }
  creative.updatedAt = nowIso();
  await db.creatives.put(creative);

  const learning: Learning = {
    id: newId("ln"),
    briefId: brief.id,
    creativeId: creative.id,
    createdAt: nowIso(),
    hypothesis: creative.hypothesis,
    outcome,
    evidence,
    nextHypothesis: str(formData, "nextHypothesis") || undefined,
    author: str(formData, "author", "AP"),
  };
  await db.learnings.put(learning);
  revalidatePath(`/briefs/${brief.id}`);
  revalidatePath("/");
}

export async function addLearningAction(formData: FormData) {
  const briefId = str(formData, "briefId");
  const brief = await db.briefs.get(briefId);
  if (!brief) return;
  const hypothesis = str(formData, "hypothesis");
  if (!hypothesis) return;
  await db.learnings.put({
    id: newId("ln"),
    briefId,
    createdAt: nowIso(),
    hypothesis,
    outcome: "note",
    evidence: str(formData, "evidence") || undefined,
    nextHypothesis: str(formData, "nextHypothesis") || undefined,
    author: str(formData, "author", "AP"),
  });
  revalidatePath(`/briefs/${briefId}`);
  revalidatePath("/");
}

/** Client portal decision. Authorized by the signed token, not a login. */
export async function clientDecisionAction(formData: FormData) {
  const token = str(formData, "token");
  const briefId = verifyReviewToken(token);
  if (!briefId) return;
  const creativeId = str(formData, "creativeId");
  const creative = await db.creatives.get(creativeId);
  if (!creative || creative.briefId !== briefId) return;
  const decision = str(formData, "decision") as Review["decision"];
  if (!["approved", "rejected", "comment"].includes(decision)) return;

  const review: Review = {
    id: newId("rv"),
    briefId,
    creativeId,
    createdAt: nowIso(),
    reviewer: str(formData, "reviewer", "クライアント"),
    decision,
    reasons: list<RejectReason>(formData, "reasons"),
    comment: str(formData, "comment"),
    source: "client",
  };
  await db.reviews.put(review);
  if (decision === "approved") creative.status = "approved";
  if (decision === "rejected") creative.status = "rejected";
  creative.updatedAt = nowIso();
  await db.creatives.put(creative);
  revalidatePath(`/review/${token}`);
  revalidatePath(`/briefs/${briefId}`);
}
