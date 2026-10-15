import type { Brief, Creative, PreflightIssue, PreflightResult } from "./types";
import { getTemplate, resolveColors, SPECS, templateSurfaces } from "./templates";
import { contrast, readableOn } from "./color";
import { fullWidthLength } from "./text";
import { guiltyNegative, isQuestion, mentionsLowCost } from "./rules";

/**
 * Rule-based preflight. Runs synchronously on the slot data so it can be shown
 * instantly in the editor; byte-size checks are appended after rendering.
 * Limits come from the inventory of past popups (docs/07_popup_inventory.md).
 */

// Expressions that commonly trip 景表法 / 薬機法 reviews. Not legal advice: a
// starting dictionary that each client's own NG list extends.
const RISKY_EXPRESSIONS: Array<{ re: RegExp; label: string; suggestion: string }> = [
  { re: /(必ず|絶対|100%)(治|痩|効|改善|稼)/u, label: "効果の断定", suggestion: "「〜が期待できる」「〜をサポート」など断定を避ける" },
  { re: /(業界|日本|世界)(No\.?1|一|最安|最高|最大|初)/iu, label: "No.1 / 最上級表現", suggestion: "調査機関・期間・範囲を併記できない場合は削除" },
  { re: /(完治|根治|治ります|治る)/u, label: "治癒を保証する表現", suggestion: "医療系では『改善を目指す』等に言い換える" },
  { re: /(永久|一生)/u, label: "永続性の断定", suggestion: "期間や条件を明示する" },
  { re: /(副作用(なし|ゼロ|無し)|リスクなし)/u, label: "安全性の断定", suggestion: "『医師が丁寧に説明』など事実ベースに" },
  { re: /(今だけ|本日限り|残り\d+)/u, label: "期限・限定の表示", suggestion: "実際の期限・数量と一致していることを確認（有利誤認）" },
];

export function runPreflight(brief: Brief, creative: Creative, bytes?: { format: "png" | "gif"; size: number }): PreflightResult {
  const issues: PreflightIssue[] = [];
  const spec = SPECS[brief.deviceSize];
  const template = getTemplate(creative.templateId);
  const f = template.fontSizes(brief.deviceSize);
  const c = resolveColors(brief, creative.slots);
  const s = creative.slots;
  const isChoice = template.id === "choice" || template.id === "tiles";

  // Contrast ---------------------------------------------------------------
  const surfaces = templateSurfaces(template.id, c);
  const contrastHeadline = contrast(c.text, surfaces.headlineBg);
  if (contrastHeadline < 4.5) {
    issues.push({ code: "contrast.headline", severity: contrastHeadline < 3 ? "error" : "warn", message: `見出しのコントラスト比 ${contrastHeadline.toFixed(1)}:1（推奨 4.5:1 以上）`, suggestion: "文字色または背景色を調整する" });
  }
  const contrastCta = contrast(readableOn(c.cta), c.cta);
  if (contrastCta < 4.5) {
    issues.push({ code: "contrast.cta", severity: "warn", message: `肯定ボタン文字のコントラスト比 ${contrastCta.toFixed(1)}:1`, suggestion: "アクセント色をより濃く/明るくする" });
  }
  const contrastRibbon = contrast(surfaces.ribbonFg, surfaces.ribbonBg);
  if (contrastRibbon < 3) {
    issues.push({ code: "contrast.ribbon", severity: "warn", message: `帯の文字コントラスト比 ${contrastRibbon.toFixed(1)}:1`, suggestion: template.id === "campaign" ? "アクセント色を濃くする" : "主色を濃くする" });
  }

  // Structure --------------------------------------------------------------
  if (!isQuestion(s.headline)) {
    issues.push({ code: "structure.question", severity: "warn", message: "見出しが問いかけになっていません", suggestion: "実績の勝ち構造は質問形（〜しませんか？ / 〜知りたい！）です" });
  }
  if (!isChoice && !s.negative) {
    issues.push({ code: "structure.negative", severity: "info", message: "否定ボタンがありません（CTA 1本）", suggestion: "実績の主流は『いいえ／はい』の2択。否定の逃げ道があると肯定が押されやすくなります" });
  }
  if (guiltyNegative(s)) {
    issues.push({ code: "structure.guilt", severity: "warn", message: `否定ボタン「${s.negative}」が罪悪感を煽る文言です`, suggestion: "「いいえ」「また今度」のような中立表現に" });
  }
  if (!mentionsLowCost(s)) {
    issues.push({ code: "structure.cost", severity: "warn", message: "帯・バッジに LINE／無料／30秒 のいずれも現れていません", suggestion: "行動コストの低さを帯かバッジで示す（例: LINEで簡単30秒）" });
  }
  if (isChoice && (s.options?.length ?? 0) < 2) {
    issues.push({ code: "structure.options", severity: "error", message: "多択型なのに選択肢が2つ未満です", suggestion: "選択肢を2〜3個入力する" });
  }

  // Text length ------------------------------------------------------------
  const headlineChars = fullWidthLength(s.headline);
  if (headlineChars === 0) issues.push({ code: "text.headline.empty", severity: "error", message: "見出しが空です" });
  if (headlineChars > spec.headlineMaxChars) {
    issues.push({ code: "text.headline.long", severity: headlineChars > spec.headlineMaxChars * 1.3 ? "error" : "warn", message: `見出しが全角換算 ${headlineChars} 字（推奨 ${spec.headlineMaxChars} 字以内）`, suggestion: "主語と問いだけ残し、修飾語を削る" });
  }
  const subChars = fullWidthLength(s.sub);
  if (subChars > spec.subMaxChars) {
    issues.push({ code: "text.sub.long", severity: "warn", message: `補足が全角換算 ${subChars} 字（推奨 ${spec.subMaxChars} 字以内）` });
  }
  if (fullWidthLength(s.eyebrow) > spec.eyebrowMaxChars) {
    issues.push({ code: "text.eyebrow.long", severity: "warn", message: `帯が全角換算 ${fullWidthLength(s.eyebrow)} 字（推奨 ${spec.eyebrowMaxChars} 字以内）`, suggestion: "帯は1行。「LINEで無料診断！」程度の長さに" });
  }
  if (fullWidthLength(s.cta) > spec.buttonMaxChars) {
    issues.push({ code: "text.cta.long", severity: "warn", message: `肯定ボタンが ${fullWidthLength(s.cta)} 字（推奨 ${spec.buttonMaxChars} 字以内）`, suggestion: "「はい」「診断する」「知りたい」の短い言葉に" });
  }
  if (s.negative && fullWidthLength(s.negative) > 6) {
    issues.push({ code: "text.negative.long", severity: "warn", message: "否定ボタンが長すぎます（6文字以内推奨）" });
  }
  for (const o of s.options ?? []) {
    if (fullWidthLength(o) > 12) issues.push({ code: "text.option.long", severity: "warn", message: `選択肢「${o}」が長すぎます（12文字以内推奨）` });
  }

  // Minimum font -----------------------------------------------------------
  const minFontPx = Math.min(f.sub, f.eyebrow);
  if (minFontPx < spec.minFontPx) {
    issues.push({ code: "font.min", severity: "warn", message: `最小文字サイズ ${minFontPx}px（推奨 ${spec.minFontPx}px 以上）` });
  }

  // NG words & risky expressions -------------------------------------------
  const allText = [s.eyebrow, s.headline, s.sub, s.cta, s.negative ?? "", s.badge ?? "", ...(s.options ?? [])].join("\n");
  for (const ng of brief.brand.ngWords.map((w) => w.trim()).filter(Boolean)) {
    if (allText.includes(ng)) {
      issues.push({ code: "ng.word", severity: "error", message: `NGワード「${ng}」が含まれています`, suggestion: "クライアント規約の代替表現に置き換える" });
    }
  }
  for (const r of RISKY_EXPRESSIONS) {
    const m = allText.match(r.re);
    if (m) issues.push({ code: "expr.risky", severity: "warn", message: `要注意表現（${r.label}）: 「${m[0]}」`, suggestion: r.suggestion });
  }

  // Bytes ------------------------------------------------------------------
  if (bytes) {
    const limit = bytes.format === "gif" ? spec.maxBytesGif : spec.maxBytesPng;
    if (bytes.size > limit) {
      issues.push({ code: "spec.bytes", severity: "error", message: `${bytes.format.toUpperCase()} が ${(bytes.size / 1024).toFixed(0)}KB（上限 ${(limit / 1024).toFixed(0)}KB）`, suggestion: bytes.format === "gif" ? "フレーム数を減らす／静止に変更" : "画像を圧縮する" });
    }
  }

  // Score ------------------------------------------------------------------
  const penalty = issues.reduce((acc, i) => acc + (i.severity === "error" ? 25 : i.severity === "warn" ? 8 : 2), 0);
  const score = Math.max(0, 100 - penalty);

  return { score, issues, metrics: { contrastHeadline, contrastCta, minFontPx, headlineChars, bytes: bytes?.size } };
}
