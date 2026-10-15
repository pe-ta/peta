"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, newId, nowIso } from "./store";
import { extractLp } from "./lp-extract";
import { expandBrief } from "./generate";
import { normalizeHex, readableOn } from "./color";
import { verifyReviewToken } from "./review-token";
import { critiqueCreative } from "./critique";
import { aiAvailable } from "./ai";
import { compare, formatRate } from "./stats";
import { APPEAL_AXES, HYPOTHESIS_SOURCES, HYPOTHESIS_STATUS, MOTIONS, VISUAL_AXES, WIN_METRICS } from "./types";
import type { AppealAxis, Brief, CreativeStatus, Hypothesis, Learning, Motion, RejectReason, Review, VisualAxis, WinMetric } from "./types";
import { TEMPLATES } from "./templates";
import { dnaOf } from "./dna";
import { applyResults, parseResultsText, todayJst } from "./results";

// Helpers -------------------------------------------------------------------

function str(fd: FormData, key: string, fallback = "") {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : fallback;
}
function list<T extends string>(fd: FormData, key: string, allowed?: readonly T[]): T[] {
  const vals = fd.getAll(key).filter((v): v is string => typeof v === "string") as T[];
  return allowed ? vals.filter((v) => allowed.includes(v)) : vals;
}
function hexOrUndefined(v: string) {
  return /^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v) ? normalizeHex(v) : undefined;
}

/** Redirect back to a page with a one-line notice. `redirect` throws, so call it outside try/catch. */
function back(path: string, notice: { msg?: string; err?: string }): never {
  const q = new URLSearchParams();
  if (notice.msg) q.set("msg", notice.msg);
  if (notice.err) q.set("err", notice.err);
  redirect(`${path}?${q.toString()}`);
}

function errorMessage(err: unknown) {
  const m = err instanceof Error ? err.message : String(err);
  return m.length > 160 ? `${m.slice(0, 160)}…` : m;
}

const APPEAL_IDS = APPEAL_AXES.map((a) => a.id);
const VISUAL_IDS = VISUAL_AXES.map((v) => v.id);
const MOTION_IDS = MOTIONS.map((m) => m.id);

/**
 * Reads brief fields from a form. A field that is present in the form is authoritative even
 * when empty (so the edit form can clear notes or NG words); a field the form does not carry
 * keeps the existing value. Required text fields fall back to the existing value when blank.
 */
function readBrandAndBrief(formData: FormData, existing?: Brief) {
  const text = (key: string, fallback: string) => (formData.has(key) ? str(formData, key) : fallback);
  const clientName = str(formData, "clientName") || existing?.clientName || "無題のクライアント";
  const background = hexOrUndefined(str(formData, "background")) ?? existing?.brand.background ?? "#ffffff";
  const ngRaw = text("ngWords", existing?.brand.ngWords.join("、") ?? "");
  return {
    clientName,
    industry: str(formData, "industry") || existing?.industry || "その他",
    offer: str(formData, "offer") || existing?.offer || "",
    target: str(formData, "target") || existing?.target || "",
    exitContext: text("exitContext", existing?.exitContext ?? ""),
    deviceSize: (formData.has("deviceSize") ? (str(formData, "deviceSize") === "pc" ? "pc" : "sp") : (existing?.deviceSize ?? "sp")) as "sp" | "pc",
    winMetric: (WIN_METRICS.some((m) => m.id === str(formData, "winMetric")) ? str(formData, "winMetric") : (existing?.winMetric ?? "line_add_rate")) as WinMetric,
    notes: text("notes", existing?.notes ?? "") || undefined,
    brand: {
      primary: hexOrUndefined(str(formData, "primary")) ?? existing?.brand.primary ?? "",
      accent: hexOrUndefined(str(formData, "accent")) ?? existing?.brand.accent ?? "",
      background,
      text: readableOn(background) === "#ffffff" ? "#ffffff" : "#1a1a1a",
      logoText: str(formData, "logoText") || existing?.brand.logoText || clientName,
      ngWords: ngRaw.split(/[、,\n]/).map((s) => s.trim()).filter(Boolean),
      tone: text("tone", existing?.brand.tone ?? "") || "信頼感があり、親しみやすい",
    },
    // Grid fields are only on the create form; the edit form leaves them untouched.
    appealAxes: formData.has("appealAxes") ? list<AppealAxis>(formData, "appealAxes", APPEAL_IDS) : (existing?.appealAxes ?? []),
    visualAxes: formData.has("visualAxes") ? list<VisualAxis>(formData, "visualAxes", VISUAL_IDS) : (existing?.visualAxes ?? []),
    motions: formData.has("motions") ? list<Motion>(formData, "motions", MOTION_IDS) : (existing?.motions ?? []),
  };
}

// Briefs --------------------------------------------------------------------

export async function createBriefAction(formData: FormData) {
  const lpUrl = str(formData, "lpUrl");
  const fields = readBrandAndBrief(formData);
  if (!fields.offer || !fields.target) back("/briefs/new", { err: "オファーとターゲットは必須です" });
  if (fields.appealAxes.length === 0) back("/briefs/new", { err: "フックを1つ以上選んでください" });
  if (fields.visualAxes.length === 0) fields.visualAxes = ["art"];
  if (fields.motions.length === 0) fields.motions = ["static"];

  let briefId = "";
  let failure = "";
  try {
    const lp = lpUrl ? await extractLp(lpUrl) : { colors: [], headings: [] };
    const brief: Brief = {
      id: newId("br"),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      ...fields,
      brand: {
        ...fields.brand,
        primary: fields.brand.primary || lp.colors[0] || "#0b6e4f",
        accent: fields.brand.accent || lp.colors[1] || "#e5484d",
      },
      lpUrl,
      lpTitle: lp.title,
      lpDescription: lp.description,
      lpOgImage: lp.ogImage,
      copySource: "fallback",
    };
    await db.briefs.put(brief);
    briefId = brief.id;
    const { source, note } = await expandBrief(brief);
    brief.copySource = source;
    await db.briefs.put(brief);
    if (note) failure = note;
  } catch (err) {
    console.error("createBriefAction failed", err);
    // The brief may already exist: send the user there so they can regenerate instead of duplicating it.
    if (briefId) back(`/briefs/${briefId}`, { err: `候補の生成に失敗しました（${errorMessage(err)}）。「下書きを再生成」で再試行できます` });
    back("/briefs/new", { err: `作成に失敗しました: ${errorMessage(err)}` });
  }
  back(`/briefs/${briefId}`, failure ? { msg: `候補を生成しました（${failure}）` } : { msg: "候補を生成しました。まず辛口分析でふるいにかけてください" });
}

export async function updateBriefAction(formData: FormData) {
  const id = str(formData, "briefId");
  const brief = await db.briefs.get(id);
  if (!brief) back("/", { err: "ブリーフが見つかりません" });
  const fields = readBrandAndBrief(formData, brief);
  if (!fields.offer || !fields.target) back(`/briefs/${id}/edit`, { err: "オファーとターゲットは必須です" });
  Object.assign(brief, fields, { updatedAt: nowIso() });
  if (brief.appealAxes.length === 0) brief.appealAxes = ["compatibility"];
  await db.briefs.put(brief);
  revalidatePath(`/briefs/${id}`);
  back(`/briefs/${id}`, { msg: "ブリーフを更新しました。既存の候補には反映されません（再生成で反映）" });
}

export async function regenerateAction(formData: FormData) {
  const briefId = str(formData, "briefId");
  const brief = await db.briefs.get(briefId);
  if (!brief) back("/", { err: "ブリーフが見つかりません" });
  let note = "";
  try {
    const existing = await db.creatives.listByBrief(briefId);
    for (const c of existing) if (c.status === "draft") await db.creatives.delete(c.id);
    await detachDeletedCreatives(briefId, existing.filter((c) => c.status === "draft").map((c) => c.id));
    const r = await expandBrief(brief);
    brief.copySource = r.source;
    brief.updatedAt = nowIso();
    await db.briefs.put(brief);
    note = r.note ?? "";
  } catch (err) {
    console.error("regenerateAction failed", err);
    back(`/briefs/${briefId}`, { err: `再生成に失敗しました: ${errorMessage(err)}` });
  }
  revalidatePath(`/briefs/${briefId}`);
  back(`/briefs/${briefId}`, { msg: note ? `下書きを再生成しました（${note}）` : "下書きを再生成しました" });
}

// Creatives -----------------------------------------------------------------

export async function updateCreativeAction(formData: FormData) {
  const id = str(formData, "creativeId");
  const creative = await db.creatives.get(id);
  if (!creative) back("/", { err: "案が見つかりません" });
  if (["live", "ended"].includes(creative.status)) back(`/creatives/${id}`, { err: "配信中・終了した案は編集できません（実験の比較対象が変わるため）" });
  const headline = str(formData, "headline");
  const cta = str(formData, "cta");
  if (!headline || !cta) back(`/creatives/${id}`, { err: "見出しと肯定ボタンは必須です" });
  const options = str(formData, "options")
    .split(/[、,\n／/]/)
    .map((o) => o.trim())
    .filter(Boolean)
    .slice(0, 3);
  creative.slots = {
    eyebrow: str(formData, "eyebrow"),
    headline,
    sub: str(formData, "sub"),
    cta,
    negative: str(formData, "negative") || undefined,
    badge: str(formData, "badge") || undefined,
    options: options.length ? options : undefined,
    imageUrl: /^https?:\/\//.test(str(formData, "imageUrl")) ? str(formData, "imageUrl") : undefined,
    primary: hexOrUndefined(str(formData, "primary")),
    accent: hexOrUndefined(str(formData, "accent")),
  };
  creative.hypothesis = str(formData, "hypothesis", creative.hypothesis);
  const motion = str(formData, "motion") as Motion;
  if (MOTION_IDS.includes(motion)) creative.motion = motion;
  const templateId = str(formData, "templateId");
  if (TEMPLATES.some((t) => t.id === templateId)) creative.templateId = templateId;
  const visual = str(formData, "visualAxis") as VisualAxis;
  if (VISUAL_IDS.includes(visual)) creative.visualAxis = visual;
  creative.version += 1;
  creative.critique = undefined; // the critique described the previous version
  creative.updatedAt = nowIso();
  await db.creatives.put(creative);
  revalidatePath(`/creatives/${id}`);
  revalidatePath(`/briefs/${creative.briefId}`);
  back(`/creatives/${id}`, { msg: `v${creative.version} として保存し、再描画しました。辛口分析は再実行が必要です` });
}

/** Internal-only status changes. Everything else moves through submit / client decision / experiment actions. */
const MANUAL_TRANSITIONS: Partial<Record<CreativeStatus, CreativeStatus[]>> = {
  draft: ["reviewing"],
  reviewing: ["draft"],
  rejected: ["draft"],
};

export async function setStatusAction(formData: FormData) {
  const id = str(formData, "creativeId");
  const status = str(formData, "status") as CreativeStatus;
  const creative = await db.creatives.get(id);
  if (!creative) back("/", { err: "案が見つかりません" });
  if (!MANUAL_TRANSITIONS[creative.status]?.includes(status)) back(`/creatives/${id}`, { err: "この状態変更はここからはできません" });
  creative.status = status;
  creative.updatedAt = nowIso();
  await db.creatives.put(creative);
  revalidatePath(`/briefs/${creative.briefId}`);
  revalidatePath(`/creatives/${id}`);
  back(`/creatives/${id}`, { msg: "ステータスを更新しました" });
}

export async function submitForReviewAction(formData: FormData) {
  const briefId = str(formData, "briefId");
  const ids = list<string>(formData, "creativeIds");
  if (ids.length === 0) back(`/briefs/${briefId}`, { err: "提出する案にチェックを入れてください" });
  let n = 0;
  for (const id of ids) {
    const c = await db.creatives.get(id);
    if (!c || c.briefId !== briefId) continue;
    c.status = "submitted";
    c.updatedAt = nowIso();
    await db.creatives.put(c);
    n++;
  }
  revalidatePath(`/briefs/${briefId}`);
  back(`/briefs/${briefId}`, { msg: `${n} 案をクライアント確認に回しました。承認ポータルのリンクを送ってください` });
}

export async function deleteCreativeAction(formData: FormData) {
  const id = str(formData, "creativeId");
  const creative = await db.creatives.get(id);
  if (!creative) back("/", { err: "案が見つかりません" });
  const brief = await db.briefs.get(creative.briefId);
  if (brief?.championId === id) back(`/creatives/${id}`, { err: "チャンピオンは削除できません。先に別の案を昇格させてください" });
  if (creative.status === "live") back(`/creatives/${id}`, { err: "配信中の案は削除できません。先に実験を終了してください" });
  await db.creatives.delete(id);
  await detachDeletedCreatives(creative.briefId, [id]);
  revalidatePath(`/briefs/${creative.briefId}`);
  back(`/briefs/${creative.briefId}`, { msg: "案を削除しました" });
}

// Critique ------------------------------------------------------------------

export async function critiqueAction(formData: FormData) {
  const id = str(formData, "creativeId");
  const creative = await db.creatives.get(id);
  if (!creative) back("/", { err: "案が見つかりません" });
  const brief = await db.briefs.get(creative.briefId);
  if (!brief) back("/", { err: "ブリーフが見つかりません" });
  try {
    const champion = brief.championId ? await db.creatives.get(brief.championId) : null;
    creative.critique = await critiqueCreative(brief, creative, champion ?? undefined);
    creative.updatedAt = nowIso();
    await db.creatives.put(creative);
  } catch (err) {
    console.error("critiqueAction failed", err);
    back(`/creatives/${id}`, { err: `辛口分析に失敗しました: ${errorMessage(err)}` });
  }
  revalidatePath(`/creatives/${id}`);
  revalidatePath(`/briefs/${creative.briefId}`);
  back(`/creatives/${id}`, { msg: creative.critique?.source === "ai" ? "辛口分析を更新しました" : "簡易判定で分析しました（生成AIの API キーを設定すると画像を見た本分析になります）" });
}

/** Vision critiques take ~10-20s each, so with AI we do a few per click and tell the user how many remain. */
const CRITIQUE_BATCH = 3;

export async function critiqueAllAction(formData: FormData) {
  const briefId = str(formData, "briefId");
  const brief = await db.briefs.get(briefId);
  if (!brief) back("/", { err: "ブリーフが見つかりません" });
  const creatives = await db.creatives.listByBrief(briefId);
  const champion = brief.championId ? creatives.find((c) => c.id === brief.championId) : undefined;
  const targets = creatives.filter((c) => !c.critique && c.status !== "ended");
  const batch = aiAvailable() ? targets.slice(0, CRITIQUE_BATCH) : targets;
  let done = 0;
  try {
    for (const c of batch) {
      c.critique = await critiqueCreative(brief, c, champion);
      c.updatedAt = nowIso();
      await db.creatives.put(c);
      done++;
    }
  } catch (err) {
    console.error("critiqueAllAction failed", err);
    revalidatePath(`/briefs/${briefId}`);
    back(`/briefs/${briefId}`, { err: `${done} 案を分析後にエラー: ${errorMessage(err)}` });
  }
  revalidatePath(`/briefs/${briefId}`);
  const remaining = targets.length - done;
  back(`/briefs/${briefId}`, { msg: remaining > 0 ? `${done} 案を分析しました。残り ${remaining} 案はもう一度押してください` : `${done} 案を分析しました` });
}

// Experiment loop -----------------------------------------------------------

export async function startExperimentAction(formData: FormData) {
  const id = str(formData, "creativeId");
  const creative = await db.creatives.get(id);
  if (!creative) back("/", { err: "案が見つかりません" });
  const brief = await db.briefs.get(creative.briefId);
  if (!brief) back("/", { err: "ブリーフが見つかりません" });
  if (creative.status !== "approved") back(`/briefs/${brief.id}`, { err: "クライアント承認済みの案だけ配信に投入できます" });
  creative.status = "live";
  creative.experiment = { startedAt: nowIso() };
  if (creative.hypothesisId) {
    const h = await db.hypotheses.get(creative.hypothesisId);
    if (h) {
      h.status = "testing";
      h.outcome = undefined;
      h.updatedAt = nowIso();
      await db.hypotheses.put(h);
    }
  }
  creative.results ??= { impressions: 0, clicks: 0, lineAdds: 0, conversions: 0, updatedAt: nowIso() };
  creative.updatedAt = nowIso();
  await db.creatives.put(creative);
  let becameChampion = false;
  if (!brief.championId) {
    brief.championId = creative.id;
    brief.updatedAt = nowIso();
    await db.briefs.put(brief);
    becameChampion = true;
  }
  revalidatePath(`/briefs/${brief.id}`);
  revalidatePath(`/creatives/${id}`);
  revalidatePath("/");
  back(`/briefs/${brief.id}`, { msg: becameChampion ? "配信開始。最初の案なのでチャンピオン（比較の基準）になりました" : "挑戦者として配信開始しました。結果を入力すると勝率が出ます" });
}

export async function saveResultsAction(formData: FormData) {
  const id = str(formData, "creativeId");
  const creative = await db.creatives.get(id);
  if (!creative) back("/", { err: "案が見つかりません" });
  const num = (k: string) => Math.max(0, Math.round(Number(str(formData, k, "0")) || 0));
  const impressions = num("impressions");
  const clicks = num("clicks");
  const lineAdds = num("lineAdds");
  const conversions = num("conversions");
  if (clicks > impressions || lineAdds > impressions || conversions > impressions) {
    back(`/briefs/${creative.briefId}`, { err: "クリック・LINE追加・CV は表示回数を超えられません" });
  }
  creative.results = { impressions, clicks, lineAdds, conversions, blocks: num("blocks") || undefined, updatedAt: nowIso() };
  creative.updatedAt = nowIso();
  await db.creatives.put(creative);
  const date = todayJst();
  await db.snapshots.put({ id: `sn_${creative.id}_${date}`, briefId: creative.briefId, creativeId: creative.id, date, impressions, clicks, lineAdds, conversions, blocks: num("blocks") || undefined, source: "manual", createdAt: nowIso() });
  revalidatePath(`/briefs/${creative.briefId}`);
  revalidatePath("/");
  back(`/briefs/${creative.briefId}`, { msg: "結果を保存しました" });
}

/** Conclude a challenger: promote to champion (won) or retire it (lost / inconclusive). Writes a learning entry. */
export async function concludeAction(formData: FormData) {
  const id = str(formData, "creativeId");
  const outcome = str(formData, "outcome") as "won" | "lost" | "inconclusive";
  if (!["won", "lost", "inconclusive"].includes(outcome)) back("/", { err: "不正な操作です" });
  const creative = await db.creatives.get(id);
  if (!creative) back("/", { err: "案が見つかりません" });
  const brief = await db.briefs.get(creative.briefId);
  if (!brief) back("/", { err: "ブリーフが見つかりません" });
  const champion = brief.championId ? await db.creatives.get(brief.championId) : null;
  const cmp = compare(brief.winMetric, creative.results, champion?.results);
  if (outcome === "won" && cmp.verdict !== "won") back(`/briefs/${brief.id}`, { err: `まだ勝ち判定が出ていません（${cmp.reason}）` });
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
    author: str(formData, "author") || "AP",
    dna: dnaOf(creative),
  };
  await db.learnings.put(learning);
  if (creative.hypothesisId) {
    const h = await db.hypotheses.get(creative.hypothesisId);
    if (h) {
      // A hypothesis expands into several cells; it is concluded once none of them is still in flight.
      const siblings = (await db.creatives.listByBrief(brief.id)).filter((c) => c.hypothesisId === h.id && c.id !== creative.id);
      const inFlight = siblings.some((c) => ["live", "approved", "submitted"].includes(c.status) && c.id !== brief.championId);
      const anyWon = outcome === "won" || siblings.some((c) => c.experiment?.outcome === "won");
      if (!inFlight) {
        h.status = "concluded";
        h.outcome = anyWon ? "won" : outcome === "inconclusive" && siblings.every((c) => c.experiment?.outcome !== "lost") ? "inconclusive" : "lost";
        h.learningId = learning.id;
      }
      h.updatedAt = nowIso();
      await db.hypotheses.put(h);
    }
  }
  revalidatePath(`/briefs/${brief.id}`);
  revalidatePath("/");
  back(`/briefs/${brief.id}`, { msg: outcome === "won" ? "新しいチャンピオンに昇格しました。学びログに記録済み" : "挑戦を終了し、学びログに記録しました" });
}

export async function addLearningAction(formData: FormData) {
  const briefId = str(formData, "briefId");
  const brief = await db.briefs.get(briefId);
  if (!brief) back("/", { err: "ブリーフが見つかりません" });
  const hypothesis = str(formData, "hypothesis");
  if (!hypothesis) back(`/briefs/${briefId}`, { err: "学び・仮説を入力してください" });
  await db.learnings.put({
    id: newId("ln"),
    briefId,
    createdAt: nowIso(),
    hypothesis,
    outcome: "note",
    evidence: str(formData, "evidence") || undefined,
    nextHypothesis: str(formData, "nextHypothesis") || undefined,
    author: str(formData, "author") || "AP",
  });
  revalidatePath(`/briefs/${briefId}`);
  revalidatePath("/");
  back(`/briefs/${briefId}`, { msg: "学びを記録しました" });
}

// Client portal -------------------------------------------------------------

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
  if (decision === "rejected" && !str(formData, "comment") && list(formData, "reasons").length === 0) {
    back(`/review/${token}`, { err: "修正依頼には理由かコメントを添えてください" });
  }

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
  back(`/review/${token}`, { msg: decision === "approved" ? "承認を受け付けました。ありがとうございます" : decision === "rejected" ? "修正依頼を受け付けました" : "コメントを送信しました" });
}

// Hypothesis backlog (v0.5) -------------------------------------------------

/** Deleted creatives leave their hypothesis; one with nothing left returns to the backlog. */
async function detachDeletedCreatives(briefId: string, deletedIds: string[]) {
  if (!deletedIds.length) return;
  const gone = new Set(deletedIds);
  for (const h of await db.hypotheses.listByBrief(briefId)) {
    if (!h.creativeIds.some((id) => gone.has(id))) continue;
    h.creativeIds = h.creativeIds.filter((id) => !gone.has(id));
    if (h.creativeIds.length === 0 && h.status === "drafting") h.status = "backlog";
    h.updatedAt = nowIso();
    await db.hypotheses.put(h);
  }
}

const HYPOTHESIS_STATUS_IDS = HYPOTHESIS_STATUS.map((s) => s.id);

export async function addHypothesisAction(formData: FormData) {
  const briefId = str(formData, "briefId");
  const brief = await db.briefs.get(briefId);
  if (!brief) back("/", { err: "ブリーフが見つかりません" });
  const title = str(formData, "title");
  if (!title) back(`/briefs/${briefId}`, { err: "仮説を一文で入力してください" });
  const hook = str(formData, "hook");
  const priority = Number(str(formData, "priority", "2"));
  const source = str(formData, "source", "ap");
  const h: Hypothesis = {
    id: newId("hy"),
    briefId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    title,
    rationale: str(formData, "rationale") || undefined,
    hook: APPEAL_IDS.includes(hook as AppealAxis) ? (hook as AppealAxis) : "compatibility",
    source: HYPOTHESIS_SOURCES.some((s) => s.id === source) ? (source as Hypothesis["source"]) : "ap",
    priority: priority === 1 || priority === 3 ? priority : 2,
    status: "backlog",
    creativeIds: [],
    author: str(formData, "author") || "AP",
  };
  await db.hypotheses.put(h);
  revalidatePath(`/briefs/${briefId}`);
  revalidatePath("/");
  back(`/briefs/${briefId}`, { msg: "仮説をバックログに追加しました" });
}

export async function setHypothesisStatusAction(formData: FormData) {
  const id = str(formData, "hypothesisId");
  const h = await db.hypotheses.get(id);
  if (!h) back("/", { err: "仮説が見つかりません" });
  const status = str(formData, "status");
  if (!HYPOTHESIS_STATUS_IDS.includes(status as Hypothesis["status"])) back(`/briefs/${h.briefId}`, { err: "不正な状態です" });
  const priority = Number(str(formData, "priority", String(h.priority)));
  if (priority === 1 || priority === 2 || priority === 3) h.priority = priority;
  h.status = status as Hypothesis["status"];
  h.updatedAt = nowIso();
  await db.hypotheses.put(h);
  revalidatePath(`/briefs/${h.briefId}`);
  back(`/briefs/${h.briefId}`, { msg: "仮説を更新しました" });
}

/** Turn one backlog entry into draft creatives (visual x motion cells of the brief). */
export async function generateForHypothesisAction(formData: FormData) {
  const id = str(formData, "hypothesisId");
  const h = await db.hypotheses.get(id);
  if (!h) back("/", { err: "仮説が見つかりません" });
  const brief = await db.briefs.get(h.briefId);
  if (!brief) back("/", { err: "ブリーフが見つかりません" });
  let note = "";
  try {
    const r = await expandBrief(brief, { hypothesis: h });
    h.creativeIds = [...h.creativeIds, ...r.created.map((c) => c.id)];
    h.status = "drafting";
    h.updatedAt = nowIso();
    await db.hypotheses.put(h);
    brief.copySource = r.source;
    brief.updatedAt = nowIso();
    await db.briefs.put(brief);
    note = r.note ?? "";
  } catch (err) {
    console.error("generateForHypothesisAction failed", err);
    back(`/briefs/${h.briefId}`, { err: `案の生成に失敗しました: ${errorMessage(err)}` });
  }
  revalidatePath(`/briefs/${h.briefId}`);
  back(`/briefs/${h.briefId}`, { msg: note ? `仮説から案を作りました（${note}）` : "仮説から案を作りました。辛口分析でふるってください" });
}

// Results import (v0.5) --------------------------------------------------------

/**
 * Paste of the delivery platform's export. Accepts comma or tab separated rows with a
 * header; recognised columns (case-insensitive, Japanese or English):
 *   creative_id | zc | 案ID, date | 日付, impressions | 表示, clicks | タップ | クリック,
 *   line_adds | 友だち追加 | LINE追加, conversions | CV, blocks | ブロック
 * Values are cumulative to the row's date. The newest row per creative becomes its results.
 */
export async function importResultsAction(formData: FormData) {
  const briefId = str(formData, "briefId");
  const brief = await db.briefs.get(briefId);
  if (!brief) back("/", { err: "ブリーフが見つかりません" });
  const text = str(formData, "csv");
  if (!text) back(`/briefs/${briefId}`, { err: "CSV を貼り付けてください" });
  const parsed = parseResultsText(text);
  if (parsed.error) back(`/briefs/${briefId}`, { err: parsed.error });
  const r = await applyResults(briefId, parsed.rows, "csv");
  revalidatePath(`/briefs/${briefId}`);
  revalidatePath("/");
  const warn = (r.unknown.length ? `。未知の案ID ${r.unknown.length} 件は無視（${r.unknown.slice(0, 3).join(", ")}）` : "") + (r.invalid.length ? `。不正な行 ${r.invalid.length} 件は無視（${r.invalid[0]}）` : "");
  if (r.imported === 0) back(`/briefs/${briefId}`, { err: `取り込める行がありませんでした${warn}` });
  back(`/briefs/${briefId}`, { msg: `${r.imported} 行を取り込み、${r.updated} 案の結果を更新しました${warn}` });
}
