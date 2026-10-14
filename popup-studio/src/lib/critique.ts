import "server-only";
import { z } from "zod";
import { aiAvailable } from "./ai";
import { generateJson } from "./llm";
import { renderCreative } from "./render";
import { runPreflight } from "./preflight";
import { fullWidthLength } from "./text";
import { APPEAL_AXES, type Brief, type Creative, type Critique } from "./types";

/**
 * 辛口分析: blunt critique of a popup, in the same shape as the short-video
 * analyzer (input -> analysis -> score + fixes). Uses the configured vision
 * model (Gemini / OpenAI / Claude); otherwise a rule-based critic so the loop
 * still runs.
 */

const CritiqueSchema = z.object({
  overall: z.number().min(0).max(100).describe("総合点。70点以上は『このまま配信してよい』の意味。甘くつけない"),
  verdict: z.string().describe("一言の辛口総評。30字以内。婉曲表現を使わない"),
  scores: z.object({
    attention: z.number().min(0).max(100).describe("注目: 離脱の瞬間、0.5秒で目に入るか"),
    clarity: z.number().min(0).max(100).describe("明確さ: 何が得られるか1秒で分かるか"),
    fit: z.number().min(0).max(100).describe("文脈適合: 離脱直前の心理（迷い・価格不安・面倒）に答えているか"),
    cta: z.number().min(0).max(100).describe("CTA: 次の行動が具体的で負担が小さいか。LINEへ行く理由があるか"),
    trust: z.number().min(0).max(100).describe("信頼: ブランドの色・トーン・業種に合い、怪しく見えないか"),
    risk: z.number().min(0).max(100).describe("表現リスクの低さ: 景表法・薬機法・誇大表現。高いほど安全"),
  }),
  problems: z.array(z.string()).min(2).max(5).describe("容赦ない指摘。何が悪いかだけでなく、なぜクリックされないかの原因まで書く"),
  fixes: z.array(z.string()).min(2).max(5).describe("具体的な直し方。文言は実際の置き換え案を書く（例: 見出しを「〜」に）"),
  vsChampion: z
    .object({
      challengerWins: z.boolean().describe("この案が現行チャンピオンより成果（LINE追加率）を出すと予測するか"),
      confidence: z.number().min(0).max(1).describe("予測の確信度 0-1"),
      reason: z.string().describe("理由。40字以内"),
    })
    .nullable()
    .describe("チャンピオン画像が与えられた場合のみ。無ければ null"),
});

const SYSTEM = `あなたは日本のD2C・医療・美容・金融のWeb離脱時ポップアップを10年以上評価してきた、極めて辛口のクリエイティブディレクターです。
評価対象は「サイトを離れようとした瞬間に表示され、LINE友だち追加へ誘導するポップアップ」です。
評価の原則:
- 甘い点数をつけない。平均的な案は50点前後、配信に値するのは70点以上、80点以上は稀。
- 指摘は原因まで書く。「弱い」ではなく「数字が無いので比較検討中の人に刺さらない」のように。
- 直し方は文言レベルで書く。置き換え案を具体的に示す。
- 離脱直前のユーザー心理（迷い・価格への不安・面倒くささ・信用できない）に対して、この案が何を解消しているかを基準にする。
- 景表法・薬機法に触れそうな表現（断定・No.1・副作用なし・永久など）は risk を大きく下げる。
- チャンピオン画像が与えられた場合は、どちらがLINE追加率で勝つかを予測し、理由を一文で述べる。`;

export async function critiqueCreative(brief: Brief, creative: Creative, champion?: Creative): Promise<Critique> {
  if (!aiAvailable()) return rulesCritique(brief, creative, champion);

  const png = await renderCreative(brief, creative, { format: "png", scale: 0.75 });
  const images = [{ label: "評価対象の案", image: { mediaType: "image/png" as const, data: png.bytes } }];
  if (champion && champion.id !== creative.id) {
    const cp = await renderCreative(brief, champion, { format: "png", scale: 0.75 });
    images.push({ label: "現行チャンピオン", image: { mediaType: "image/png" as const, data: cp.bytes } });
  }
  const user = `# 文脈
クライアント: ${brief.clientName}（業種: ${brief.industry}）
オファー: ${brief.offer}
ターゲット: ${brief.target}
離脱文脈: ${brief.exitContext || "不明"}
トーン: ${brief.brand.tone}
NGワード: ${brief.brand.ngWords.join("、") || "なし"}
訴求軸: ${APPEAL_AXES.find((a) => a.id === creative.appealAxis)?.label}
この案の検証仮説: ${creative.hypothesis}
テキスト: 小見出し「${creative.slots.eyebrow}」/ 見出し「${creative.slots.headline}」/ サブ「${creative.slots.sub}」/ CTA「${creative.slots.cta}」/ バッジ「${creative.slots.badge ?? ""}」
${images.length > 1 ? "チャンピオン画像を与えています。vsChampion を必ず埋めてください。" : "チャンピオン画像はありません。vsChampion は null。"}

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
  const hasNumber = /\d/.test(`${s.headline} ${s.badge ?? ""}`);
  const mentionsLine = /LINE|ライン/i.test(s.cta);
  const ctaVerb = /(受け取る|見る|始める|はじめる|相談|診断|登録|追加|試す|チェック)/.test(s.cta);
  const headlineLen = fullWidthLength(s.headline);
  const problems: string[] = [];
  const fixes: string[] = [];

  let attention = 55 + (s.badge ? 15 : 0) + (creative.motion !== "static" ? 8 : 0) - (headlineLen > 20 ? 10 : 0);
  let clarity = 50 + (hasNumber ? 20 : -10) + (headlineLen <= 16 ? 10 : 0);
  let fit = 50;
  let cta = 45 + (mentionsLine ? 20 : 0) + (ctaVerb ? 15 : 0);
  let trust = 60 + (brief.brand.tone ? 5 : 0);
  let risk = 90;

  if (!hasNumber) {
    problems.push("見出しに数字が無い。比較検討中の離脱者は『いくら得か』で判断するため、抽象的な便益は読まれない。");
    fixes.push(`見出しに数字を入れる。例: 「${brief.offer.match(/\d+[%％円]/)?.[0] ?? "◯%OFF"}はLINEで受け取れます」`);
  }
  if (headlineLen > 18) {
    problems.push(`見出しが全角換算${headlineLen}字。離脱の瞬間に読み切れる長さは14〜16文字で、後半は読まれない。`);
    fixes.push("便益と数字だけ残し、修飾語を削る。2行以内に収める。");
  }
  if (!mentionsLine) {
    problems.push("CTAに遷移先（LINE）が無い。押した先が分からないボタンは離脱直前のユーザーに押されない。");
    fixes.push("CTAを「LINEで◯◯を受け取る」の形にする。");
    cta -= 10;
  }
  if (!ctaVerb) {
    problems.push("CTAが動詞で終わっていない。行動のイメージが湧かない。");
    fixes.push("CTAを命令形の動詞で終える（受け取る / 診断する / 相談する）。");
  }
  if (brief.exitContext && /料金|価格|値段/.test(brief.exitContext) && creative.appealAxis !== "price" && creative.appealAxis !== "benefit") {
    problems.push("離脱文脈が料金ページなのに、訴求が価格に答えていない。離脱理由と訴求がずれている。");
    fixes.push("この文脈では価格・特典軸を優先し、他軸はサブコピーで補う。");
    fit -= 15;
  } else {
    fit += 10;
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
  if (!s.sub || fullWidthLength(s.sub) < 10) {
    problems.push("サブコピーが薄く、『なぜ今LINEなのか』の理由が無い。");
    fixes.push("サブコピーに『友だち追加で何が・いつ届くか』を1文で書く。");
    clarity -= 10;
  }
  if (problems.length < 2) {
    problems.push("無難にまとまっているが、この案でなければならない理由が無い。チャンピオンとの差分が小さく、検証しても学びが少ない。");
    fixes.push("訴求軸を1つに絞り、見出しの主語をユーザーにする（例: 『まだ迷っているあなたへ』）。");
  }

  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  const scores = { attention: clamp(attention), clarity: clamp(clarity), fit: clamp(fit), cta: clamp(cta), trust: clamp(trust), risk: clamp(risk) };
  const overall = clamp(scores.attention * 0.2 + scores.clarity * 0.25 + scores.fit * 0.2 + scores.cta * 0.2 + scores.trust * 0.05 + scores.risk * 0.1);
  const verdict = overall >= 70 ? "配信して検証する価値はある" : overall >= 50 ? "このままでは平均的。1点直せば候補になる" : "この案は捨てて作り直した方が早い";

  let vsChampion: Critique["vsChampion"];
  if (champion && champion.id !== creative.id) {
    const champ = rulesCritique(brief, { ...champion }, undefined);
    const diff = overall - champ.overall;
    vsChampion = {
      championId: champion.id,
      challengerWins: diff > 0,
      confidence: Math.min(0.9, 0.5 + Math.abs(diff) / 100),
      reason: diff > 0 ? "見出しの数字とCTAの具体性でチャンピオンを上回る" : "チャンピオンより訴求の明確さで劣る",
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
  { key: "attention", label: "注目", hint: "離脱の瞬間に0.5秒で目に入るか" },
  { key: "clarity", label: "明確さ", hint: "何が得られるか1秒で分かるか" },
  { key: "fit", label: "文脈適合", hint: "離脱直前の心理に答えているか" },
  { key: "cta", label: "CTA", hint: "次の行動が具体的で負担が小さいか" },
  { key: "trust", label: "信頼", hint: "ブランド・業種に合い怪しく見えないか" },
  { key: "risk", label: "表現の安全", hint: "景表法・薬機法リスクの低さ" },
];
