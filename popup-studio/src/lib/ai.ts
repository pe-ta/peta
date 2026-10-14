import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { APPEAL_AXES, type AppealAxis, type Brief } from "./types";

/**
 * Copy generation. Uses Claude when ANTHROPIC_API_KEY is present; otherwise a
 * deterministic fallback so the product keeps working in demos and tests.
 */

export const CopyVariantSchema = z.object({
  appealAxis: z.enum(["price", "scarcity", "anxiety", "diagnosis", "social", "benefit"]),
  eyebrow: z.string().describe("小見出し。10文字以内。例: LINE限定 / 今だけ"),
  headline: z.string().describe("見出し。18文字以内。数字と便益を含める"),
  sub: z.string().describe("サブコピー。35文字以内。行動の具体と安心材料"),
  cta: z.string().describe("CTA文言。12文字以内。LINEへの遷移が分かる動詞で終える"),
  badge: z.string().describe("バッジ。オファーの数字を6文字以内で。無ければ空文字"),
  hypothesis: z.string().describe("この案で検証したい仮説を一文で"),
  rationale: z.string().describe("なぜ離脱直前のユーザーに効くと考えるか。40文字以内"),
});

const CopySetSchema = z.object({ variants: z.array(CopyVariantSchema) });
export type CopyVariant = z.infer<typeof CopyVariantSchema>;

export function aiAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

const SYSTEM = `あなたは日本のD2C・医療・美容・金融領域でWeb離脱時ポップアップのコピーを書く熟練のコミュニケーションデザイナーです。
ポップアップはサイトを離れようとする瞬間に表示され、LINE友だち追加へ誘導し、LINE上のチャットボットで接客してCVに至ります。
制約:
- 文字数制限を厳守する（見出し18字、サブ35字、CTA12字、小見出し10字、バッジ6字）。全角で数える。
- 景表法・薬機法に抵触しうる断定表現（必ず治る、No.1、副作用なし、永久 等）を使わない。
- 「今だけ」「残り◯名」など期限・限定表現は、ブリーフにその事実がある場合のみ使う。
- クライアントのNGワードを使わない。
- CTAは遷移先（LINE）が分かる具体的な動詞で終える。例: 「LINEでクーポンを受け取る」。
- 訴求軸ごとに、離脱直前のユーザーの心理（迷い・比較・価格不安・面倒）に答える。
- 各案に検証仮説を一文で付ける。仮説は後で勝敗を学習に使うため、観測可能な言い切りにする。`;

export async function generateCopy(brief: Brief, axes: AppealAxis[]): Promise<{ variants: CopyVariant[]; source: "ai" | "fallback"; note?: string }> {
  if (!aiAvailable()) {
    return { variants: fallbackCopy(brief, axes), source: "fallback", note: "ANTHROPIC_API_KEY 未設定のためルールベースで生成" };
  }
  const client = new Anthropic();
  const axisLabels = axes.map((a) => `${a}（${APPEAL_AXES.find((x) => x.id === a)?.label}）`).join("、");
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

# 依頼
以下の訴求軸それぞれについて1案ずつ、合計${axes.length}案を作成してください: ${axisLabels}
appealAxis には指定したIDをそのまま入れること。`;

  try {
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 4096,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
      output_config: { effort: "medium", format: betaZodOutputFormat(CopySetSchema) },
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return { variants: fallbackCopy(brief, axes), source: "fallback", note: "モデルが応答を返さなかったためルールベースで生成" };
    }
    // Keep only requested axes, fill any missing ones from the fallback.
    const got = response.parsed_output.variants.filter((v) => axes.includes(v.appealAxis));
    const missing = axes.filter((a) => !got.some((v) => v.appealAxis === a));
    return { variants: [...got, ...fallbackCopy(brief, missing)], source: "ai" };
  } catch (err) {
    const msg = err instanceof Anthropic.APIError ? `API error ${err.status}: ${err.message}` : (err as Error).message;
    console.error("generateCopy failed", msg);
    return { variants: fallbackCopy(brief, axes), source: "fallback", note: `生成APIエラーのためルールベースで生成（${msg}）` };
  }
}

// Deterministic fallback -----------------------------------------------------

function offerNumber(offer: string) {
  const m = offer.match(/(\d+)\s*(%|％|円|日|回|名)/);
  return m ? `${m[1]}${m[2] === "％" ? "%" : m[2]}${m[2] === "%" || m[2] === "％" ? "OFF" : ""}` : "";
}

export function fallbackCopy(brief: Brief, axes: AppealAxis[]): CopyVariant[] {
  const badge = offerNumber(brief.offer);
  // Drop a leading "LINE限定" so headlines don't say LINE twice ("LINE限定…はLINEで").
  const offerCore = brief.offer.replace(/^\s*LINE\s*(限定|友だち限定|登録者限定)\s*/i, "").trim() || brief.offer;
  const offerChars = [...offerCore].length;
  // Keep the offer whole in the headline when it fits; otherwise lead with the number.
  const offer = offerChars <= 12 ? offerCore : badge ? `${badge}の特典` : "限定特典";
  // "30代男性、初めて検討、価格を比較中" -> "30代男性" (the first segment is the persona; the rest is context).
  const persona = brief.target.split(/[、,，/／・\u3000 ]/)[0]?.trim() || "あなた";
  const medical = /医療|美容|クリニック|薬|歯科|サプリ/.test(`${brief.industry} ${brief.clientName}`);
  const thing = medical ? "治療" : /EC|通販|化粧品|食品/.test(brief.industry) ? "商品" : "サービス";
  const base: Record<AppealAxis, Omit<CopyVariant, "appealAxis">> = {
    price: {
      eyebrow: "LINE限定",
      headline: `${offer}はLINEで受け取れます`,
      sub: `友だち追加で、今見ていた${thing}に使える割引クーポンをすぐお届けします。`,
      cta: "LINEでクーポンを受け取る",
      badge,
      hypothesis: "価格メリットを数字で明示すると、料金比較で離脱する層のクリック率が上がる",
      rationale: "離脱理由の最上位は価格。数字が目に入る",
    },
    scarcity: {
      eyebrow: "お見逃しなく",
      headline: "この特典はLINE登録者だけ",
      sub: `サイトには載せていない${offer}を、LINEでご案内しています。`,
      cta: "LINEで特典を見る",
      badge,
      hypothesis: "限定性を示すと、様子見で離脱する層の行動が前倒しされる",
      rationale: "機会損失の回避は離脱直前に強く働く",
    },
    anxiety: {
      eyebrow: "まだ迷っている方へ",
      headline: medical ? "LINEで匿名のまま相談できます" : "LINEで気軽に相談できます",
      sub: medical ? "名前も顔も出さずに質問できます。無理に来院を勧めることはありません。" : "質問に答えるだけで、あなたに合う選択肢をご案内します。",
      cta: "LINEで相談してみる",
      badge: "",
      hypothesis: "不安解消型は、情報収集段階の離脱者で友だち追加後の継続率が高い",
      rationale: "決めきれない人に『相談』は負担が低い",
    },
    diagnosis: {
      eyebrow: "30秒セルフチェック",
      headline: `3問で${medical ? "治療が必要か" : "あなたに合うか"}分かる`,
      sub: "LINEで質問に答えると、結果と特典をその場でお届けします。",
      cta: "LINEで診断をはじめる",
      badge: "3問",
      hypothesis: "診断型は参加ハードルが低く、クリック率とボット起動率の両方で勝つ",
      rationale: "自分事化と小さな行動の提示",
    },
    social: {
      eyebrow: "多くの方に選ばれています",
      headline: `${persona}に選ばれている理由`,
      sub: `同じ悩みで来られた方の声と実績を、LINEでまとめてご紹介します。${badge ? `${badge}の特典付き。` : ""}`,
      cta: "LINEで体験談を見る",
      badge: "",
      hypothesis: "社会的証明は、比較検討で離脱する層の信頼獲得に効く",
      rationale: "他者の選択が判断コストを下げる",
    },
    benefit: {
      eyebrow: "LINE友だち限定",
      headline: "友だち追加だけで特典が届く",
      sub: `${offerCore}。LINEで受け取って、好きなタイミングで使えます。`,
      cta: "LINEで特典を受け取る",
      badge,
      hypothesis: "即時の特典提示は、離脱直前の『今は要らない』を『取っておく』に変える",
      rationale: "損失回避と即時報酬",
    },
  };
  return axes.map((a) => ({ appealAxis: a, ...base[a] }));
}
