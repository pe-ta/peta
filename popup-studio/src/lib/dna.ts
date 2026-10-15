import { APPEAL_AXES, normalizeAppeal, normalizeMotion, normalizeVisual, type Creative, type Dna } from "./types";
import { getTemplate } from "./templates";

/**
 * DNA tags: the axes the learning log aggregates win rates on. Derived from
 * the creative itself so they stay consistent across edits. Vocabulary follows
 * the persuasion-strategy taxonomies (AAAI 2023 ad corpus / PVP 2025) where a
 * Japanese equivalent exists; see docs/08_research_2026.md.
 */

const TEXT_TAGS: Array<[RegExp, string]> = [
  [/無料|0円|タダ/, "無料訴求"],
  [/\d+\s*(秒|分|問)/, "行動コストの明示"],
  [/今だけ|本日|期間限定|まで|残り/, "希少性・期限"],
  [/\d+\s*(%|％|円|万円|ポイント)/, "数字の提示"],
  [/招待|あなただけ|限定/, "特別感"],
  [/相性|ぴったり|合う|合って|あなたに/, "自己関連性"],
  [/不安|悩|困|迷|モヤモヤ|疲れ|気になる/, "問題の顕在化"],
  [/選ばれ|人気|実績|満足度|万人/, "社会的証明"],
  [/医師|専門|監修|公式/, "権威"],
  [/いくら|価格|料金|費用/, "価格の不確実性低減"],
];

export function dnaOf(creative: Creative): Dna {
  const hook = normalizeAppeal(creative.appealAxis);
  const s = creative.slots;
  const layout = getTemplate(creative.templateId).id;
  const structure: Dna["structure"] = (layout === "choice" || layout === "tiles") && s.options && s.options.length >= 2 ? "multi_choice" : s.negative ? "two_buttons" : "single_cta";
  const text = [s.eyebrow, s.headline, s.sub, s.badge ?? "", s.cta, s.negative ?? "", ...(s.options ?? [])].join(" ");
  const tags = new Set<string>(APPEAL_AXES.find((a) => a.id === hook)?.be ?? []);
  for (const [re, tag] of TEXT_TAGS) if (re.test(text)) tags.add(tag);
  if (/？|\?/.test(s.headline)) tags.add("質問形");
  return { hook, structure, visual: normalizeVisual(creative.visualAxis), motion: normalizeMotion(creative.motion), layout, tags: [...tags] };
}

export const STRUCTURE_LABEL: Record<Dna["structure"], string> = { two_buttons: "2ボタン", single_cta: "CTA 1本", multi_choice: "多択" };
