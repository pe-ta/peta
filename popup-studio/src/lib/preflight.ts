import type { Brief, Creative, PreflightIssue, PreflightResult } from "./types";
import { getTemplate, resolveColors, SPECS } from "./templates";
import { contrast, readableOn } from "./color";
import { fullWidthLength } from "./text";

/**
 * Rule-based preflight. Runs synchronously on the slot data so it can be shown
 * instantly in the editor; byte-size checks are appended after rendering.
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

  // Contrast ---------------------------------------------------------------
  const headlineBg = template.visualAxis === "text" ? c.primary : template.visualAxis === "coupon" ? "#ffffff" : c.background;
  const headlineFg = template.visualAxis === "text" ? c.onPrimary : template.visualAxis === "coupon" ? "#1a1a1a" : c.text;
  const contrastHeadline = contrast(headlineFg, headlineBg);
  if (contrastHeadline < 4.5) {
    issues.push({
      code: "contrast.headline",
      severity: contrastHeadline < 3 ? "error" : "warn",
      message: `見出しのコントラスト比 ${contrastHeadline.toFixed(1)}:1（推奨 4.5:1 以上）`,
      suggestion: "文字色または背景色を調整する",
    });
  }
  const ctaBg = template.visualAxis === "text" ? c.ctaOnPrimary : c.cta;
  const contrastCta = contrast(readableOn(ctaBg), ctaBg);
  if (contrastCta < 4.5) {
    issues.push({ code: "contrast.cta", severity: "warn", message: `CTA文字のコントラスト比 ${contrastCta.toFixed(1)}:1`, suggestion: "CTAの色をより濃く/明るくする" });
  }
  if (template.visualAxis === "text" && contrast(c.accent, c.primary) < 2.5) {
    issues.push({ code: "cta.blend", severity: "info", message: "アクセント色が主色に近いため、CTAは白/黒で代替しています", suggestion: "補色方向のアクセント色を指定すると目立ちます" });
  }

  // Text length ------------------------------------------------------------
  const headlineChars = fullWidthLength(s.headline);
  if (headlineChars === 0) issues.push({ code: "text.headline.empty", severity: "error", message: "見出しが空です" });
  if (headlineChars > spec.headlineMaxChars) {
    issues.push({
      code: "text.headline.long",
      severity: headlineChars > spec.headlineMaxChars * 1.3 ? "error" : "warn",
      message: `見出しが全角換算 ${headlineChars} 字（推奨 ${spec.headlineMaxChars} 字以内）`,
      suggestion: "数字と便益を残し、修飾語を削る",
    });
  }
  const subChars = fullWidthLength(s.sub);
  if (subChars > spec.subMaxChars) {
    issues.push({ code: "text.sub.long", severity: "warn", message: `サブコピーが全角換算 ${subChars} 字（推奨 ${spec.subMaxChars} 字以内）` });
  }
  if (fullWidthLength(s.cta) > 14) {
    issues.push({ code: "text.cta.long", severity: "warn", message: "CTAが長すぎます（14文字以内推奨）", suggestion: "動詞で終える短い命令形にする（例: LINEで受け取る）" });
  }
  if (!/LINE|ライン/i.test(`${s.cta} ${s.eyebrow} ${s.sub}`)) {
    issues.push({ code: "cta.line", severity: "info", message: "LINEへの遷移先が文言に現れていません", suggestion: "遷移先の明示はクリック後の離脱を減らします" });
  }

  // Minimum font -----------------------------------------------------------
  const minFontPx = Math.min(f.sub, f.eyebrow);
  if (minFontPx < spec.minFontPx) {
    issues.push({ code: "font.min", severity: "warn", message: `最小文字サイズ ${minFontPx}px（推奨 ${spec.minFontPx}px 以上）` });
  }

  // NG words & risky expressions -------------------------------------------
  const allText = [s.eyebrow, s.headline, s.sub, s.cta, s.badge ?? ""].join("\n");
  for (const ng of brief.brand.ngWords.map((w) => w.trim()).filter(Boolean)) {
    if (allText.includes(ng)) {
      issues.push({ code: "ng.word", severity: "error", message: `NGワード「${ng}」が含まれています`, suggestion: "クライアント規約の代替表現に置き換える" });
    }
  }
  for (const r of RISKY_EXPRESSIONS) {
    const m = allText.match(r.re);
    if (m) {
      issues.push({ code: "expr.risky", severity: "warn", message: `要注意表現（${r.label}）: 「${m[0]}」`, suggestion: r.suggestion });
    }
  }

  // Bytes ------------------------------------------------------------------
  if (bytes) {
    const limit = bytes.format === "gif" ? spec.maxBytesGif : spec.maxBytesPng;
    if (bytes.size > limit) {
      issues.push({
        code: "spec.bytes",
        severity: "error",
        message: `${bytes.format.toUpperCase()} が ${(bytes.size / 1024).toFixed(0)}KB（上限 ${(limit / 1024).toFixed(0)}KB）`,
        suggestion: bytes.format === "gif" ? "フレーム数を減らす／静止に変更" : "画像を圧縮する",
      });
    }
  }

  // Score ------------------------------------------------------------------
  const penalty = issues.reduce((acc, i) => acc + (i.severity === "error" ? 25 : i.severity === "warn" ? 8 : 2), 0);
  const score = Math.max(0, 100 - penalty);

  return {
    score,
    issues,
    metrics: { contrastHeadline, contrastCta, minFontPx, headlineChars, bytes: bytes?.size },
  };
}
