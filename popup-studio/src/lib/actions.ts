"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, newId, nowIso } from "./store";
import { extractLp } from "./lp-extract";
import { expandBrief } from "./generate";
import { normalizeHex, readableOn } from "./color";
import { verifyReviewToken } from "./review-token";
import type { AppealAxis, Brief, CreativeStatus, Motion, RejectReason, Review, VisualAxis } from "./types";

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
