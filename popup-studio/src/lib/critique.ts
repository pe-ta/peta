import "server-only";
import { z } from "zod";
import { aiAvailable } from "./ai";
import { generateJson } from "./llm";
import { renderCreative } from "./render";
import { runPreflight } from "./preflight";
import { fullWidthLength } from "./text";
import { appealLabel, normalizeAppeal, normalizeMotion, type Brief, type Creative, type Critique } from "./types";
import { BUTTON_PAIRS } from "./corpus";
import { getTemplate } from "./templates";
import { guiltyNegative, isQuestion, mentionsLowCost } from "./rules";

/**
 * 辛口分析: blunt critique of a popup, in the same shape as the short-video
 * analyzer (input -> analysis -> score + fixes).
 *
 * v0.4 follows the comparative-reasoning recipe (Creative4U, 2025): when a
 * champion exists the model first lists the concrete differences, then reasons
 * about which difference moves the win metric, then predicts. Absolute scores
 * are kept for ranking drafts before a champion exists.
 */

const CritiqueSchema = z.object({
  overall: z.number().min(0).max(100).describe("総合点。70点以上は『このまま配信してよい』の意味。甘くつけない"),
  verdict: z.string().describe("一言の辛口総評。30字以内。婉曲表現を使わない"),
  scores: z.object({
    attention: z.number().min(0).max(100).describe("注目: 離脱の瞬間、0.5秒で帯と見出しが目に入るか"),
    clarity: z.number().min(0).max(100).describe("質問の明確さ: 何を聞かれているか、答えると何が起きるか1秒で分かるか"),
    fit: z.number().min(0).max(100).describe("文脈適合: 離脱直前の心理（迷い・価格不安・面倒）に質問が答えているか"),
    cta: z.number().min(0).max(100).describe("ボタン対: 肯定が押しやすく、否定が自然な逃げ道か。LINE・無料・30秒のいずれかを示しているか"),
    trust: z.number().min(0).max(100).describe("信頼: ブランドの色・トーン・業種に合い、怪しく見えないか"),
    risk: z.number().min(0).max(100).describe("表現リスクの低さ: 景表法・薬機法・誇大表現。高いほど安全"),
  }),
  problems: z.array(z.string()).min(2).max(5).describe("容赦ない指摘。何が悪いかだけでなく、なぜタップされないかの原因まで書く"),
  fixes: z.array(z.string()).min(2).max(5).describe("具体的な直し方。文言は実際の置き換え案を書く（例: 見出しを「〜」に）"),
  vsChampion: z
    .object({
      diff: z.string().describe("チャンピオンとの具体的な差分を3点以内で。帯・見出し・ビジュアル・ボタン対のどこが違うか"),
      challengerWins: z.boolean().describe("この案が現行チャンピオンより成果（LINE追加率）を出すと予測するか"),
      confidence: z.number().min(0).max(1).describe("予測の確信度 0-1。差分が小さければ 0.5 付近"),
      reason: z.string().describe("どの差分が指標を動かすか。40字以内"),
    })
    .nullable()
    .describe("チャンピオン画像が与えられた場合のみ。無ければ null"),
});

const SYSTEM = `あなたは日本のD2C・医療・美容・金融・教育のWeb離脱時ポップアップを10年以上評価してきた、極めて辛口のクリエイティブディレクターです。
評価対象は「サイトを離れようとした瞬間に表示され、LINE友だち追加へ誘導するポップアップ」です。
過去1,000枚超の実績が示す勝ち構造: 上部の帯（LINE・無料・30秒のどれか）/ 読み手への質問見出し / ビジュアル / 小バッジ / 左に否定・右に肯定のボタン対。
実績で多いボタン対: ${BUTTON_PAIRS.slice(0, 5).map((p) => `${p[0]}／${p[1]}`).join("、")}。

評価の原則:
- 甘い点数をつけない。平均的な案は50点前後、配信に値するのは70点以上、80点以上は稀。
- 指摘は原因まで書く。「弱い」ではなく「見出しが宣伝文で質問になっていないので、答える動機が生まれない」のように。
- 直し方は文言レベルで書く。置き換え案を具体的に示す。
- 離脱直前のユーザー心理（迷い・価格への不安・面倒くささ・信用できない）に対して、この案が何を解消しているかを基準にする。
- 否定ボタンは逃げ道。「いいえ」「また今度」のように自然で、罪悪感を煽る文言（「損してもいい」等）は減点。
- 景表法・薬機法に触れそうな表現（断定・No.1・副作用なし・永久など）は risk を大きく下げる。
- チャンピオン画像が与えられた場合は、まず差分を列挙し、次にどの差分がLINE追加率を動かすかを考え、最後に勝敗を予測する。差分が小さい案は確信度を0.5付近にする。`;

export async function critiqueCreative(brief: Brief, creative: Creative, champion?: Creative): Promise<Critique> {
  if (!aiAvailable()) return rulesCritique(brief, creative, champion);

  const png = await renderCreative(brief, creative, { format: "png", scale: 0.6 });
  const images = [{ label: "評価対象の案", image: { mediaType: "image/png" as const, data: png.bytes } }];
  if (champion && champion.id !== creative.id) {
    const cp = await renderCreative(brief, champion, { format: "png", scale: 0.6 });
    images.push({ label: "現行チャンピオン", image: { mediaType: "image/png" as const, data: cp.bytes } });
  }
  const s = creative.slots;
  const user = `# 文脈
クライアント: ${brief.clientName}（業種: ${brief.industry}）
オファー: ${brief.offer}
ターゲット: ${brief.target}
離脱文脈: ${brief.exitContext || "不明"}
トーン: ${brief.brand.tone}
NGワード: ${brief.brand.ngWords.join("、") || "なし"}
フック: ${appealLabel(creative.appealAxis)}
この案の検証仮説: ${creative.hypothesis}
テキスト: 帯「${s.eyebrow}」/ 見出し「${s.headline}」/ 補足「${s.sub}」/ バッジ「${s.badge ?? ""}」/ 肯定「${s.cta}」/ 否定「${s.negative ?? "（なし）"}」${s.options?.length ? ` / 選択肢「${s.options.join("」「")}」` : ""}
${images.length > 1 ? `チャンピオン画像を与えています。チャンピオンのテキスト: 帯「${champion!.slots.eyebrow}」/ 見出し「${champion!.slots.headline}」/ 肯定「${champion!.slots.cta}」/ 否定「${champion!.slots.negative ?? "（なし）"}」。vsChampion を必ず埋めてください。` : "チャンピオン画像はありません。vsChampion は null。"}

辛口に評価してください。`;

  const res = await generateJson({ system: SYSTEM, user, images, schema: CritiqueSchema, maxTokens: 4096 });
  if (!res.ok) return rulesCritique(brief, creative, champion, `生成APIエラー（${res.error}）のためルール判定`);
  const p = res.data;
  return {
    createdAt: new Date().toISOString(),
    source: "ai",
    overall: Math.round(p.overall),
    verdict: p.verdict,
    scores: Object.fromEntries(Object.entries(p.scores).map(([k, v]) => [k, Math.round(v)])) as Critique["scores"],
    problems: p.problems,
    fixes: p.fixes,
    vsChampion: p.vsChampion && champion ? { championId: champion.id, ...p.vsChampion } : undefined,
  };
}

// Rule-based critic ---------------------------------------------------------

export function rulesCritique(brief: Brief, creative: Creative, champion?: Creative, note?: string): Critique {
  const pre = runPreflight(brief, creative);
  const s = creative.slots;
  const hook = normalizeAppeal(creative.appealAxis);
  const question = isQuestion(s.headline);
  const lowCost = mentionsLowCost(s);
  const hasPair = !!s.negative || (["choice", "tiles"].includes(getTemplate(creative.templateId).id) && (s.options?.length ?? 0) >= 2);
  const posShort = fullWidthLength(s.cta) <= 8;
  const guilt = guiltyNegative(s);
  const headlineLen = fullWidthLength(s.headline);
  const hasNumber = /\d/.test(`${s.headline} ${s.badge ?? ""} ${s.eyebrow}`);
  const problems: string[] = [];
  const fixes: string[] = [];

  let attention = 55 + (s.eyebrow ? 10 : -10) + (creative.motion !== "static" ? 6 : 0) - (headlineLen > 24 ? 12 : 0);
  let clarity = 50 + (question ? 20 : -15) + (headlineLen <= 20 ? 8 : 0);
  let fit = 50;
  const cta = 40 + (hasPair ? 20 : 0) + (posShort ? 10 : -5) + (lowCost ? 15 : 0) - (guilt ? 20 : 0);
  let trust = 60 + (brief.brand.tone ? 5 : 0);
  let risk = 90;

  if (!question) {
    problems.push("見出しが質問になっていない。実績の勝ちパターンは『〜しませんか？』『〜知りたい！』の問いかけで、宣伝文には答える動機が生まれない。");
    fixes.push(`見出しを問いかけにする。例: 「${brief.brand.logoText || brief.clientName}との相性をチェックしませんか？」`);
  }
  if (!hasPair) {
    problems.push("ボタンが1本しかない。実績の主流は『いいえ／はい』の2択で、否定の逃げ道があるほうが肯定のタップ率が上がる。");
    fixes.push("否定ボタンを足す。「いいえ」か「また今度」。肯定は「はい」「診断する」「知りたい」の8文字以内。");
  }
  if (guilt) {
    problems.push(`否定ボタン「${s.negative}」が罪悪感を煽る文言。不快感はブランド毀損になり、クライアント確認で差し戻される。`);
    fixes.push("否定ボタンは「いいえ」「また今度」のような中立表現にする。");
  }
  if (!lowCost) {
    problems.push("帯とバッジに LINE・無料・30秒のいずれも無い。行動コストが見えないと、離脱直前のユーザーは面倒だと判断して閉じる。");
    fixes.push("帯を「LINEで無料診断！」、バッジを「LINEで簡単30秒」にする。");
  }
  if (headlineLen > 24) {
    problems.push(`見出しが全角換算${headlineLen}字。2行に収まらず、後半は読まれない。`);
    fixes.push("主語（クライアント名）と問いだけ残し、修飾語を削る。24文字以内。");
  }
  if (brief.exitContext && /料金|価格|値段|費用/.test(brief.exitContext) && hook !== "price" && hook !== "campaign") {
    problems.push("離脱文脈が料金ページなのに、質問が価格に触れていない。離脱理由と問いがずれている。");
    fixes.push("この文脈では『結局いくらかかるの？』型か特典の数字を主役にした型を優先する。");
    fit -= 15;
  } else {
    fit += 10;
  }
  if (hook === "campaign" && !hasNumber) {
    problems.push("キャンペーン型なのに数字が無い。特典は数字で見せないと比較検討中の人に刺さらない。");
    fixes.push(`バッジにオファーの数字を入れる。例: 「${brief.offer.match(/\d+[%％円]/)?.[0] ?? "最大◯円"}」`);
    clarity -= 10;
  }
  for (const i of pre.issues) {
    if (i.code === "ng.word" || i.code === "expr.risky") {
      risk -= i.severity === "error" ? 40 : 20;
      problems.push(`${i.message}。クライアント確認で必ず差し戻される。`);
      if (i.suggestion) fixes.push(i.suggestion);
    }
    if (i.code.startsWith("contrast")) {
      attention -= 10;
      trust -= 5;
      problems.push(`${i.message}。スマホの屋外では読めない。`);
      if (i.suggestion) fixes.push(i.suggestion);
    }
  }
  if (problems.length < 2) {
    problems.push("構造は実績の勝ちパターンに沿っているが、この案でなければならない理由が無い。チャンピオンとの差分が小さく、検証しても学びが少ない。");
    fixes.push("フックを1つに絞り、見出しの主語をユーザーにする（例: 『まだ迷っているあなたへ』）。");
  }

  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  const scores = { attention: clamp(attention), clarity: clamp(clarity), fit: clamp(fit), cta: clamp(cta), trust: clamp(trust), risk: clamp(risk) };
  const overall = clamp(scores.attention * 0.2 + scores.clarity * 0.25 + scores.fit * 0.2 + scores.cta * 0.2 + scores.trust * 0.05 + scores.risk * 0.1);
  const verdict = overall >= 70 ? "配信して検証する価値はある" : overall >= 50 ? "このままでは平均的。1点直せば候補になる" : "この案は捨てて作り直した方が早い";

  let vsChampion: Critique["vsChampion"];
  if (champion && champion.id !== creative.id) {
    const champ = rulesCritique(brief, { ...champion }, undefined);
    const diffs: string[] = [];
    if (normalizeAppeal(champion.appealAxis) !== hook) diffs.push(`フックが${appealLabel(champion.appealAxis)}→${appealLabel(hook)}`);
    if (getTemplate(champion.templateId).id !== getTemplate(creative.templateId).id) diffs.push("レイアウトが異なる");
    if (champion.slots.headline !== s.headline) diffs.push("見出しが異なる");
    if ((champion.slots.negative ?? "") !== (s.negative ?? "") || champion.slots.cta !== s.cta) diffs.push("ボタン対が異なる");
    if (normalizeMotion(champion.motion) !== normalizeMotion(creative.motion)) diffs.push("動きが異なる");
    const diff = overall - champ.overall;
    vsChampion = {
      championId: champion.id,
      diff: diffs.length ? diffs.slice(0, 3).join("、") : "差分がほぼ無い",
      challengerWins: diff > 0,
      confidence: diffs.length === 0 ? 0.5 : Math.min(0.85, 0.5 + Math.abs(diff) / 120),
      reason: diff > 0 ? "質問の明確さとボタン対の自然さでチャンピオンを上回る" : "チャンピオンより問いの明確さで劣る",
    };
  }

  return {
    createdAt: new Date().toISOString(),
    source: "rules",
    overall,
    verdict: note ? `${verdict}（${note}）` : verdict,
    scores,
    problems: problems.slice(0, 5),
    fixes: fixes.slice(0, 5),
    vsChampion,
  };
}

export const CRITIQUE_AXES: { key: keyof Critique["scores"]; label: string; hint: string }[] = [
  { key: "attention", label: "注目", hint: "離脱の瞬間に帯と見出しが0.5秒で目に入るか" },
  { key: "clarity", label: "質問の明確さ", hint: "何を聞かれ、答えると何が起きるか1秒で分かるか" },
  { key: "fit", label: "文脈適合", hint: "離脱直前の心理に質問が答えているか" },
  { key: "cta", label: "ボタン対", hint: "肯定が押しやすく、否定が自然な逃げ道か" },
  { key: "trust", label: "信頼", hint: "ブランド・業種に合い怪しく見えないか" },
  { key: "risk", label: "表現の安全", hint: "景表法・薬機法リスクの低さ" },
];
