import "server-only";
import { z } from "zod";
import { APPEAL_AXES, type AppealAxis, type Brief } from "./types";
import { generateJson, providerLabel, resolveProvider } from "./llm";
import { BUTTON_PAIRS, EYEBROWS, BADGES } from "./corpus";
import { describeEntry, findSimilar } from "./library";

/**
 * Copy generation for the five-band popup structure (ribbon / question /
 * visual / badge / button pair). Uses whichever LLM provider is configured
 * (Gemini / OpenAI / Claude, see llm.ts); otherwise a deterministic fallback so
 * the product keeps working in demos and tests.
 */

export const CopyVariantSchema = z.object({
  appealAxis: z.enum(["compatibility", "invitation", "pain", "campaign", "quiz", "type_choice", "price"]),
  eyebrow: z.string().describe("帯の文言。14文字以内。例: LINEで無料診断！ / ◯◯から招待状が届きました / かんたん30秒"),
  headline: z.string().describe("質問見出し。24文字以内、2行まで。必ず読み手への問いかけ（〜しませんか？ / 〜知りたい！ / 〜気になる…）"),
  sub: z.string().describe("補足。28文字以内。『あなたに合ったプランをチェック』のような一言。無ければ空文字"),
  badge: z.string().describe("小バッジ。10文字以内。LINE・無料・30秒・◯問 のいずれかを含める。例: LINEで簡単30秒。キャンペーン型ではオファーの数字（例: 最大2万円）"),
  cta: z.string().describe("肯定ボタン。8文字以内。例: はい / 診断する / 知りたい / チェックする"),
  negative: z.string().describe("否定ボタン。6文字以内。例: いいえ / また今度。多択型では空文字"),
  options: z.array(z.string()).max(3).describe("多択型（type_choice / quiz）のみ、選択肢を2〜3個、各10文字以内。他の型では空配列"),
  hypothesis: z.string().describe("この案で検証したい仮説を一文で"),
  rationale: z.string().describe("なぜ離脱直前のユーザーに効くと考えるか。40文字以内"),
});

const CopySetSchema = z.object({ variants: z.array(CopyVariantSchema) });
export type CopyVariant = z.infer<typeof CopyVariantSchema>;

export function aiAvailable() {
  return resolveProvider() !== null;
}

/** Human-readable name of the configured provider, or null. */
export function aiProviderName() {
  return providerLabel(resolveProvider());
}

const SYSTEM = `あなたは日本のD2C・医療・美容・金融・教育領域で、Web離脱時ポップアップのコピーを書く熟練のコミュニケーションデザイナーです。
ポップアップはサイトを離れようとする瞬間に表示され、LINE友だち追加へ誘導し、LINE上のチャットボットで接客してCVに至ります。

過去1,000枚超の実績から分かっている「勝ちやすい構造」:
- 帯（上部）: 「LINEで無料診断！」「◯◯から招待状が届きました」「かんたん30秒」のように、無料・LINE・短時間のどれかを示す。
- 見出し: 読み手への質問にする。「◯◯との相性をチェックしませんか？」「〜したのに、また…と感じていませんか？」「結局いくらかかるの？」。断定や宣伝文ではなく問いかけ。
- 小バッジ: 「LINEで簡単30秒」「無料」「3問」。行動コストの低さを数字で示す。
- ボタン対: 左に否定（いいえ／また今度）、右に肯定（はい／診断する／知りたい／チェックする）。否定は逃げ道として自然な言葉にし、罪悪感を煽らない。
- 実績で多い帯: ${EYEBROWS.slice(0, 8).join(" / ")}
- 実績で多いボタン対: ${BUTTON_PAIRS.slice(0, 6).map((p) => `${p[0]}／${p[1]}`).join("、")}
- 実績で多いバッジ: ${BADGES.slice(0, 6).join(" / ")}

制約:
- 文字数制限を厳守する（帯14字、見出し24字、補足28字、バッジ10字、肯定8字、否定6字）。全角で数える。
- 景表法・薬機法に抵触しうる断定表現（必ず治る、No.1、副作用なし、永久 等）を使わない。
- 「今だけ」「残り◯名」など期限・限定表現は、ブリーフにその事実がある場合のみ使う。
- クライアントのNGワードを使わない。
- 見出しは必ず疑問形か呼びかけで終える。
- フックごとに、離脱直前のユーザーの心理（迷い・比較・価格不安・面倒）に答える。
- 各案に検証仮説を一文で付ける。仮説は後で勝敗を学習に使うため、観測可能な言い切りにする。`;

export async function generateCopy(brief: Brief, axes: AppealAxis[]): Promise<{ variants: CopyVariant[]; source: "ai" | "fallback"; note?: string }> {
  if (!aiAvailable()) {
    return { variants: fallbackCopy(brief, axes), source: "fallback", note: "生成AIの API キー未設定のためルールベースで生成" };
  }
  const axisLabels = axes.map((a) => `${a}（${APPEAL_AXES.find((x) => x.id === a)?.label}: ${APPEAL_AXES.find((x) => x.id === a)?.hint}）`).join("\n- ");
  // Few-shot from the past-popup library: same industry / hook. OCR text, so treat as style reference only.
  const examples = axes.flatMap((a) => findSimilar(brief, a, 2)).filter((e, i, arr) => arr.findIndex((x) => x.id === e.id) === i).slice(0, 6);
  const exampleText = examples.length
    ? `\n# 同業種・同フックの過去実績（OCR 抽出のため誤字あり。文体と構造の参考にし、文言はコピーしない）\n${examples.map((e) => `- [${e.industry} / ${e.hook}] ${describeEntry(e)}`).join("\n")}\n`
    : "";
  const user = `# ブリーフ
クライアント: ${brief.clientName}（業種: ${brief.industry}）
LP: ${brief.lpUrl}
LPタイトル: ${brief.lpTitle ?? "不明"}
LP概要: ${brief.lpDescription ?? "不明"}
オファー: ${brief.offer}
ターゲット: ${brief.target}
離脱文脈: ${brief.exitContext}
トーン: ${brief.brand.tone}
NGワード: ${brief.brand.ngWords.join("、") || "なし"}
補足: ${brief.notes ?? "なし"}
${exampleText}
# 依頼
以下のフックそれぞれについて1案ずつ、合計${axes.length}案を作成してください:
- ${axisLabels}
appealAxis には指定したIDをそのまま入れること。`;

  const res = await generateJson({ system: SYSTEM, user, schema: CopySetSchema, maxTokens: 4096 });
  if (!res.ok) {
    return { variants: fallbackCopy(brief, axes), source: "fallback", note: `生成APIエラーのためルールベースで生成（${res.error}）` };
  }
  // Keep only requested axes, fill any missing ones from the fallback.
  const got = res.data.variants.filter((v) => axes.includes(v.appealAxis));
  const missing = axes.filter((a) => !got.some((v) => v.appealAxis === a));
  return { variants: [...got, ...fallbackCopy(brief, missing)], source: "ai" };
}

// Deterministic fallback -----------------------------------------------------

function offerNumber(offer: string) {
  const m = offer.match(/(最大)?\s*(\d[\d,]*)\s*(%|％|円|日|回|名|ポイント|pt)/i);
  if (!m) return "";
  const unit = m[3] === "％" ? "%" : m[3];
  return `${m[1] ?? ""}${m[2]}${unit}${unit === "%" ? "OFF" : ""}`;
}

/** The service noun the client sells, guessed from the industry. */
function serviceNoun(brief: Brief) {
  const s = `${brief.industry} ${brief.clientName}`;
  if (/医療|美容|クリニック|薬|歯科|サプリ/.test(s)) return "治療プラン";
  if (/金融|保険|銀行|証券|カード|ローン/.test(s)) return "プラン";
  if (/教育|スクール|塾|講座/.test(s)) return "コース";
  if (/不動産|住宅/.test(s)) return "物件";
  if (/EC|通販|化粧品|食品/.test(s)) return "商品";
  return "サービス";
}

export function fallbackCopy(brief: Brief, axes: AppealAxis[]): CopyVariant[] {
  const badge = offerNumber(brief.offer);
  const noun = serviceNoun(brief);
  const name = brief.brand.logoText || brief.clientName;
  // "30代男性、初めて検討、価格を比較中" -> "30代男性" (the first segment is the persona; the rest is context).
  const persona = brief.target.split(/[、,，/／・　 ]/)[0]?.trim() || "あなた";
  const pain = brief.exitContext && !/ページ|操作|離脱|秒/.test(brief.exitContext) ? brief.exitContext : `${noun}選びで迷っていませんか？`;
  const base: Record<AppealAxis, Omit<CopyVariant, "appealAxis">> = {
    compatibility: {
      eyebrow: "LINEで無料診断！",
      headline: `${name}との相性をチェックしませんか？`,
      sub: `${persona}に合う${noun}が分かります`,
      badge: "LINEで簡単30秒",
      cta: "はい",
      negative: "いいえ",
      options: [],
      hypothesis: "『相性チェック』の問いかけは、比較検討中の離脱者の自分事化を促し友だち追加率が上がる",
      rationale: "実績で最多のフック。自己関連性と低い行動コスト",
    },
    invitation: {
      eyebrow: `${name}から招待状が届きました`,
      headline: `あなたに合った${noun}を診断しませんか？`,
      sub: "LINEで無料チェック",
      badge: badge || "無料",
      cta: "はい",
      negative: "いいえ",
      options: [],
      hypothesis: "『招待状』の特別扱いは、様子見で離脱する層の開封率（タップ率）を上げる",
      rationale: "返報性と特別感。銀行・証券で実績",
    },
    pain: {
      eyebrow: "そんなあなたへ",
      headline: pain.endsWith("？") || pain.endsWith("?") ? pain : `${pain}と感じていませんか？`,
      sub: `LINEで解決方法をチェック`,
      badge: "LINEで簡単30秒",
      cta: "気になる",
      negative: "また今度",
      options: [],
      hypothesis: "離脱理由を言語化した悩み共感型は、情報収集段階の離脱者で友だち追加後の継続率が高い",
      rationale: "問題の顕在化。美容医療・金融で実績",
    },
    campaign: {
      eyebrow: "キャンペーン実施中",
      headline: `${brief.offer.replace(/^\s*LINE\s*(限定|友だち限定|登録者限定)\s*/i, "")}、受け取りませんか？`,
      sub: "LINE友だち追加で受け取れます",
      badge: badge || "特典",
      cta: "受け取る",
      negative: "また今度",
      options: [],
      hypothesis: "特典の数字を主役にすると、価格比較で離脱する層のタップ率が上がる",
      rationale: "ゲイン・フレーミング。損失回避",
    },
    quiz: {
      eyebrow: "LINEでかんたんクイズ",
      headline: `${name}の${noun}、いくらから始められるでしょうか？`,
      sub: "答えはLINEで",
      badge: "3問で判定",
      cta: "答えを見る",
      negative: "また今度",
      options: [],
      hypothesis: "クイズ形式の好奇心ギャップは、タップ率で2ボタン型を上回る",
      rationale: "答えを知りたい欲求。美容医療で実績",
    },
    type_choice: {
      eyebrow: "あなたはどっち？",
      headline: `${noun}選び、重視するのはどちらですか？`,
      sub: "タップして診断スタート",
      badge: "LINEで簡単30秒",
      cta: "はじめる",
      negative: "",
      options: ["価格の安さ", "サポートの手厚さ"],
      hypothesis: "選択肢を押すだけの二択型は、質問に答える負担が小さくボット起動率が高い",
      rationale: "自己診断とコミットメント",
    },
    price: {
      eyebrow: "LINEで30秒チェック",
      headline: `結局、${noun}はいくらかかるの？`,
      sub: `${persona}向けの目安をLINEでご案内`,
      badge: "無料",
      cta: "知りたい",
      negative: "また今度",
      options: [],
      hypothesis: "料金ページで離脱する層には、価格の不確実性を減らす問いかけが最も効く",
      rationale: "離脱理由の最上位は価格。アンカリング",
    },
  };
  return axes.map((a) => ({ appealAxis: a, ...base[a] }));
}
