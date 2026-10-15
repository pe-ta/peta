/* eslint-disable @next/next/no-img-element */
import type { ReactElement } from "react";
import type { Brief, Creative, CreativeSlots, Motion, VisualAxis, LayoutId, AppealAxis } from "../types";
import { normalizeAppeal, normalizeMotion, normalizeVisual } from "../types";
import { complementaryButton, contrast, ensureButtonColor, hueDistance, mix, normalizeHex, readableOn, saturation } from "../color";

/**
 * Templates are code. Each template is a function of (slots, animation progress)
 * returning Satori-compatible JSX (flexbox only, inline styles).
 *
 * v0.4 follows the structure found in 1,066 past ZEALS popups
 * (docs/07_popup_inventory.md):
 *
 *   ┌──────────────────────┐
 *   │ 帯（アイブロウ）      │  LINEで無料診断！ / 招待状が届きました
 *   │ 質問見出し            │  〜との相性をチェックしませんか？
 *   │ ビジュアル            │  装飾 / 写真
 *   │ 小バッジ              │  LINEで簡単30秒
 *   │ [いいえ] [はい]       │  左: 否定（グレー） 右: 肯定（アクセント）
 *   └──────────────────────┘
 *
 * Satori gotchas honoured below:
 * - `width: 100%` + padding sizes the content box, so widths are explicit pixels.
 * - Every element with more than one child needs `display: flex`.
 * - Shorthand padding with 3 values is not parsed; use explicit sides.
 */

export interface TemplateSpec {
  width: number;
  height: number;
  maxBytesPng: number;
  maxBytesGif: number;
  minFontPx: number;
  headlineMaxChars: number;
  subMaxChars: number;
  buttonMaxChars: number;
  eyebrowMaxChars: number;
}

export interface Template {
  id: LayoutId;
  name: string;
  description: string;
  /** Hooks this layout serves best (used when expanding a brief). */
  hooks: AppealAxis[];
  spec: Record<"sp" | "pc", TemplateSpec>;
  fontSizes(size: "sp" | "pc"): { headline: number; sub: number; cta: number; eyebrow: number };
  render(args: RenderArgs): ReactElement;
}

export interface RenderArgs {
  brief: Brief;
  creative: Creative;
  size: "sp" | "pc";
  /** 0..1 progress of the entrance / loop animation. 1 = resting state. */
  t: number;
  /** When false, external images are not requested (fallback rendering). */
  allowImages: boolean;
}

export const SPECS: Record<"sp" | "pc", TemplateSpec> = {
  // 900x1265 is the de-facto ZEALS delivery spec: 957 of 1,066 past popups (90%).
  sp: { width: 900, height: 1265, maxBytesPng: 1_000_000, maxBytesGif: 3_000_000, minFontPx: 26, headlineMaxChars: 24, subMaxChars: 28, buttonMaxChars: 8, eyebrowMaxChars: 14 },
  // PC has almost no track record (one 1800x1265 file); a square canvas keeps the same column layout.
  pc: { width: 1040, height: 1040, maxBytesPng: 1_000_000, maxBytesGif: 3_000_000, minFontPx: 24, headlineMaxChars: 24, subMaxChars: 28, buttonMaxChars: 8, eyebrowMaxChars: 14 },
};

export interface ResolvedColors {
  primary: string;
  accent: string;
  background: string;
  text: string;
  onPrimary: string;
  onAccent: string;
  /** Positive button fill, guaranteed readable with white text on a light surface. */
  cta: string;
  /** Button fill for use on a primary-colored surface. */
  ctaOnPrimary: string;
  /** Negative button fill (neutral grey; never competes with the positive one). */
  negative: string;
}

export function resolveColors(brief: Brief, slots: CreativeSlots): ResolvedColors {
  const primary = normalizeHex(slots.primary ?? brief.brand.primary, "#0b6e4f");
  const accentRaw = normalizeHex(slots.accent ?? brief.brand.accent, "#e5484d");
  const background = normalizeHex(slots.background ?? brief.brand.background, "#ffffff");
  const text = normalizeHex(slots.text ?? brief.brand.text, "#1a1a1a");
  const primaryIsGrey = saturation(primary) < 0.12;
  const tooClose = saturation(accentRaw) < 0.15 || (!primaryIsGrey && hueDistance(accentRaw, primary) < 25);
  const accent = tooClose ? complementaryButton(primary) : ensureButtonColor(accentRaw);
  const cta = contrast(accent, background) >= 3 ? accent : ensureButtonColor(primary);
  const ctaOnPrimary = contrast(accent, primary) >= 2.5 ? accent : readableOn(primary) === "#ffffff" ? "#ffffff" : "#111111";
  return { primary, accent, background, text, onPrimary: readableOn(primary), onAccent: readableOn(accent), cta, ctaOnPrimary, negative: "#9b9b9b" };
}

// Easing helpers ------------------------------------------------------------

function easeOutBack(x: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}
function easeOutCubic(x: number) {
  return 1 - Math.pow(1 - x, 3);
}

/** Whole-popup transform for entrance animations. */
export function motionStyle(motion: Motion, t: number): { transform?: string; opacity?: number } {
  const p = Math.max(0, Math.min(1, t));
  if (normalizeMotion(motion) === "pop") {
    const s = 0.7 + 0.3 * easeOutBack(p);
    return { transform: `scale(${s.toFixed(3)})`, opacity: Math.min(1, p * 2) };
  }
  return {};
}

/** Blink phase (second frame of a 2-frame GIF). */
function blinkOn(motion: Motion, t: number) {
  return normalizeMotion(motion) === "blink" && t >= 0.5;
}

// Shared pieces -------------------------------------------------------------

const FONT = "Noto Sans JP";

interface Layout {
  W: number;
  H: number;
  pad: number;
  radius: number;
  band: number;
  buttonH: number;
  gap: number;
  bottom: number;
  f: { headline: number; sub: number; cta: number; eyebrow: number; badge: number; logo: number };
}

function layoutFor(size: "sp" | "pc"): Layout {
  const spec = SPECS[size];
  const W = spec.width;
  const H = spec.height;
  const k = W / 900;
  return {
    W,
    H,
    pad: Math.round(44 * k),
    radius: Math.round(36 * k),
    band: Math.round(128 * k),
    buttonH: Math.round(136 * k),
    gap: Math.round(22 * k),
    bottom: Math.round(40 * k),
    f: { headline: Math.round(58 * k), sub: Math.round(30 * k), cta: Math.round(46 * k), eyebrow: Math.round(42 * k), badge: Math.round(28 * k), logo: Math.round(22 * k) },
  };
}

/** Top ribbon with the eyebrow. A lighter tint on the blink frame. */
function Ribbon({ text, bg, fg, L, lit }: { text: string; bg: string; fg: string; L: Layout; lit: boolean }) {
  const fill = lit ? mix(bg, "#ffffff", 0.14) : bg;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: L.W, height: L.band, background: fill, color: fg, fontSize: L.f.eyebrow, fontWeight: 900, letterSpacing: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: Math.round(L.W * 0.02) }}>
        <div style={{ display: "flex", width: Math.round(L.W * 0.012), height: Math.round(L.f.eyebrow * 0.9), background: fg, opacity: 0.9, transform: "rotate(18deg)", borderRadius: 4 }} />
        <div style={{ display: "flex" }}>{text}</div>
        <div style={{ display: "flex", width: Math.round(L.W * 0.012), height: Math.round(L.f.eyebrow * 0.9), background: fg, opacity: 0.9, transform: "rotate(-18deg)", borderRadius: 4 }} />
      </div>
    </div>
  );
}

function Headline({ text, color, L, size = L.f.headline }: { text: string; color: string; L: Layout; size?: number }) {
  // Long questions shrink a step so a lone "？" never wraps onto a third line.
  const n = [...text].length;
  const fs = Math.round(size * (n > 22 ? 0.82 : n > 18 ? 0.9 : 1));
  return (
    <div style={{ display: "flex", justifyContent: "center", width: L.W - L.pad * 2, color, fontSize: fs, fontWeight: 900, lineHeight: 1.28, letterSpacing: -0.5, textAlign: "center" }}>
      {text}
    </div>
  );
}

/** Short label for the decorative visual: the badge is drawn as a pill below, so the bubble carries a glyph instead. */
function artLabel(hook: AppealAxis) {
  if (hook === "compatibility") return "相性";
  if (hook === "campaign") return "LINE";
  if (hook === "invitation") return "招待";
  return "？";
}

/** Pill badge: 「LINEで簡単30秒」. Accent fill, white text. */
function BadgePill({ text, bg, L }: { text: string; bg: string; L: Layout }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingTop: Math.round(L.f.badge * 0.38), paddingBottom: Math.round(L.f.badge * 0.38), paddingLeft: Math.round(L.f.badge * 1.1), paddingRight: Math.round(L.f.badge * 1.1), borderRadius: 999, background: bg, color: readableOn(bg), fontSize: L.f.badge, fontWeight: 900, letterSpacing: 0.5, boxShadow: "0 8px 18px rgba(0,0,0,0.18)", whiteSpace: "nowrap" }}>
      {text}
    </div>
  );
}

/** Decorative middle block when no photo is available: brand-tinted circle with a speech bubble. */
function ArtVisual({ primary, accent, label, diameter }: { primary: string; accent: string; label: string; diameter: number }) {
  const light = mix(primary, "#ffffff", 0.82);
  const mid = mix(primary, "#ffffff", 0.6);
  return (
    <div style={{ display: "flex", position: "relative", width: diameter, height: diameter, alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: diameter, height: diameter, borderRadius: 999, background: `linear-gradient(160deg, ${light} 0%, ${mid} 100%)` }} />
      <div style={{ position: "absolute", left: diameter * 0.08, top: diameter * 0.12, width: diameter * 0.16, height: diameter * 0.16, borderRadius: 999, background: mix(accent, "#ffffff", 0.55), opacity: 0.9 }} />
      <div style={{ position: "absolute", right: diameter * 0.1, bottom: diameter * 0.14, width: diameter * 0.1, height: diameter * 0.1, borderRadius: 999, background: mix(primary, "#ffffff", 0.3), opacity: 0.8 }} />
      {/* Bubble sized to its text, centred by an absolute wrapper (the same structure HeroArt used in v0.3). */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", maxWidth: diameter * 0.82 }}>
          <div style={{ display: "flex", paddingTop: Math.round(diameter * 0.05), paddingBottom: Math.round(diameter * 0.05), paddingLeft: Math.round(diameter * 0.09), paddingRight: Math.round(diameter * 0.09), borderRadius: Math.round(diameter * 0.1), background: "#ffffff", color: primary, fontSize: Math.round(diameter * 0.2), fontWeight: 900, letterSpacing: 0.5, whiteSpace: "nowrap", boxShadow: "0 16px 36px rgba(0,0,0,0.18)" }}>
            {label}
          </div>
          <div style={{ display: "flex", marginLeft: Math.round(diameter * 0.1), marginTop: -Math.round(diameter * 0.04), width: Math.round(diameter * 0.08), height: Math.round(diameter * 0.08), background: "#ffffff", transform: "rotate(45deg)", borderRadius: 6 }} />
        </div>
      </div>
    </div>
  );
}

/** Photo in a circular window with a thin brand ring. */
function PhotoVisual({ url, primary, diameter }: { url: string; primary: string; diameter: number }) {
  return (
    <div style={{ display: "flex", width: diameter, height: diameter, borderRadius: 999, overflow: "hidden", border: `${Math.round(diameter * 0.025)}px solid ${mix(primary, "#ffffff", 0.75)}`, boxShadow: "0 18px 40px rgba(0,0,0,0.16)" }}>
      <img src={url} alt="" width={diameter} height={diameter} style={{ width: diameter, height: diameter, objectFit: "cover" }} />
    </div>
  );
}

/** Negative (grey) + positive (accent) buttons, or a single positive one. */
function ButtonPair({ positive, negative, posBg, negBg, L, lit, pressed }: { positive: string; negative?: string; posBg: string; negBg: string; L: Layout; lit: boolean; pressed: boolean }) {
  const innerW = L.W - L.pad * 2;
  const posW = negative ? Math.round((innerW - L.gap) * 0.55) : innerW;
  const negW = innerW - L.gap - posW;
  const posFill = lit ? mix(posBg, "#ffffff", 0.22) : posBg;
  const scale = pressed ? 0.95 : lit ? 1.03 : 1;
  const btn = (label: string, bg: string, w: number, strong: boolean) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: w, height: L.buttonH, borderRadius: Math.round(L.buttonH * 0.18), background: bg, color: readableOn(bg), fontSize: strong ? L.f.cta : Math.round(L.f.cta * 0.9), fontWeight: 900, letterSpacing: 1, boxShadow: `0 10px 0 ${mix(bg, "#000000", 0.28)}, 0 16px 28px rgba(0,0,0,0.16)`, transform: strong ? `scale(${scale.toFixed(3)})` : undefined }}>
      {label}
    </div>
  );
  return (
    <div style={{ display: "flex", width: innerW, gap: L.gap }}>
      {negative ? btn(negative, negBg, negW, false) : null}
      {btn(positive, posFill, posW, true)}
    </div>
  );
}

/** Finger cursor for the "cursor" motion: travels from the lower right to the positive button and taps. */
function Cursor({ L, t, hasNegative }: { L: Layout; t: number; hasNegative: boolean }) {
  const innerW = L.W - L.pad * 2;
  const posW = hasNegative ? Math.round((innerW - L.gap) * 0.55) : innerW;
  const targetX = L.W - L.pad - posW / 2;
  const targetY = L.H - L.bottom - L.f.logo * 1.6 - L.buttonH / 2;
  const p = easeOutCubic(Math.min(1, t / 0.75));
  const x = Math.round(L.W * 0.86 + (targetX - L.W * 0.86) * p);
  const y = Math.round(L.H * 1.02 + (targetY - L.H * 1.02) * p);
  const press = t > 0.8 ? 0.9 : 1;
  const w = Math.round(L.W * 0.12);
  return (
    <div style={{ position: "absolute", left: x - w * 0.25, top: y - w * 0.15, display: "flex", flexDirection: "column", alignItems: "center", transform: `scale(${press})`, opacity: t < 0.05 || t >= 1 ? 0 : 1 }}>
      <div style={{ display: "flex", width: w * 0.42, height: w * 0.95, borderRadius: w * 0.21, background: "#ffffff", border: `${Math.round(w * 0.06)}px solid #2b2b2b`, marginBottom: -w * 0.3 }} />
      <div style={{ display: "flex", width: w, height: w * 0.8, borderRadius: w * 0.3, background: "#ffffff", border: `${Math.round(w * 0.06)}px solid #2b2b2b` }} />
    </div>
  );
}

function Logo({ text, color, L }: { text: string; color: string; L: Layout }) {
  return <div style={{ display: "flex", justifyContent: "center", width: L.W - L.pad * 2, fontSize: L.f.logo, fontWeight: 700, color, letterSpacing: 1 }}>{text}</div>;
}

function Frame({ L, background, m, children }: { L: Layout; background: string; m: { transform?: string; opacity?: number }; children: ReactElement[] }) {
  return (
    <div style={{ display: "flex", width: L.W, height: L.H, alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative", width: L.W, height: L.H, background, borderRadius: L.radius, overflow: "hidden", ...m }}>
        {children}
      </div>
    </div>
  );
}

function visualDiameter(L: Layout, hasSub: boolean) {
  // Whatever is left after the band, two headline lines, the sub line, the buttons and the margins.
  const used = L.band + L.pad + L.f.headline * 1.28 * 2 + L.pad * 0.6 + (hasSub ? L.f.sub * 1.5 + L.pad * 0.5 : 0) + L.f.badge * 1.4 + L.buttonH + L.f.logo * 1.6 + L.bottom + L.pad * 0.5;
  return Math.round(Math.max(L.W * 0.34, Math.min(L.W * 0.5, L.H - used)));
}

// Template 1: question (two buttons) ----------------------------------------

const question: Template = {
  id: "question",
  name: "質問・2ボタン型",
  description: "帯 + 質問見出し + ビジュアル + 小バッジ + いいえ／はい。実績の主流構造。",
  hooks: ["compatibility", "pain", "price", "quiz"],
  spec: SPECS,
  fontSizes(size) {
    const L = layoutFor(size);
    return { headline: L.f.headline, sub: L.f.sub, cta: L.f.cta, eyebrow: L.f.eyebrow };
  },
  render({ brief, creative, size, t, allowImages }) {
    const L = layoutFor(size);
    const c = resolveColors(brief, creative.slots);
    const s = creative.slots;
    const lit = blinkOn(creative.motion, t);
    const isCursor = normalizeMotion(creative.motion) === "cursor";
    const url = allowImages && normalizeVisual(creative.visualAxis) === "photo" ? s.imageUrl : undefined;
    const d = visualDiameter(L, !!s.sub);
    return (
      <Frame L={L} background={c.background} m={motionStyle(creative.motion, t)}>
        <Ribbon text={s.eyebrow || "LINEで無料診断！"} bg={c.primary} fg={c.onPrimary} L={L} lit={lit} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexGrow: 1, width: L.W, paddingTop: L.pad, paddingBottom: Math.round(L.pad * 0.5), justifyContent: "space-between" }}>
          <Headline text={s.headline} color={c.text} L={L} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: Math.round(L.pad * 0.4) }}>
            {url ? <PhotoVisual url={url} primary={c.primary} diameter={d} /> : <ArtVisual primary={c.primary} accent={c.accent} label={artLabel(normalizeAppeal(creative.appealAxis))} diameter={d} />}
            {s.badge ? (
              <div style={{ display: "flex", marginTop: -Math.round(L.f.badge * 1.1) }}>
                <BadgePill text={s.badge} bg={c.cta} L={L} />
              </div>
            ) : null}
          </div>
          {s.sub ? <div style={{ display: "flex", justifyContent: "center", width: L.W - L.pad * 2, fontSize: L.f.sub, fontWeight: 700, color: mix(c.text, c.background, 0.3), textAlign: "center", lineHeight: 1.4 }}>{s.sub}</div> : <div style={{ display: "flex" }} />}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: Math.round(L.f.logo * 0.6) }}>
            <ButtonPair positive={s.cta} negative={s.negative} posBg={c.cta} negBg={c.negative} L={L} lit={lit} pressed={isCursor && t > 0.8} />
            <Logo text={brief.brand.logoText} color={mix(c.text, c.background, 0.5)} L={L} />
          </div>
        </div>
        {isCursor ? <Cursor L={L} t={t} hasNegative={!!s.negative} /> : <div style={{ display: "flex" }} />}
      </Frame>
    );
  },
};

// Template 2: invitation ----------------------------------------------------

function Envelope({ primary, accent, label, width }: { primary: string; accent: string; label: string; width: number }) {
  const h = Math.round(width * 0.66);
  const cardW = Math.round(width * 0.82);
  const cardH = Math.round(h * 0.78);
  return (
    <div style={{ display: "flex", position: "relative", width, height: h + Math.round(cardH * 0.35), alignItems: "flex-end", justifyContent: "center" }}>
      {/* back of the envelope */}
      <div style={{ position: "absolute", left: 0, bottom: 0, width, height: h, borderRadius: Math.round(width * 0.04), background: mix(primary, "#ffffff", 0.2) }} />
      {/* letter */}
      <div style={{ position: "absolute", left: (width - cardW) / 2, bottom: Math.round(h * 0.3), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: cardW, height: cardH, borderRadius: Math.round(width * 0.03), background: "#ffffff", boxShadow: "0 14px 30px rgba(0,0,0,0.18)", color: primary, fontSize: Math.round(width * 0.09), fontWeight: 900, textAlign: "center", lineHeight: 1.3, paddingLeft: Math.round(width * 0.05), paddingRight: Math.round(width * 0.05) }}>
        <div style={{ display: "flex", width: Math.round(cardW * 0.5), height: 4, background: mix(accent, "#ffffff", 0.3), marginBottom: Math.round(width * 0.04) }} />
        <div style={{ display: "flex" }}>{label}</div>
        <div style={{ display: "flex", width: Math.round(cardW * 0.5), height: 4, background: mix(accent, "#ffffff", 0.3), marginTop: Math.round(width * 0.04) }} />
      </div>
      {/* front pocket */}
      <div style={{ position: "absolute", left: 0, bottom: 0, width, height: Math.round(h * 0.5), borderRadius: Math.round(width * 0.04), background: primary, boxShadow: "0 -6px 20px rgba(0,0,0,0.12)" }} />
      <div style={{ position: "absolute", left: (width - Math.round(width * 0.16)) / 2, bottom: Math.round(h * 0.5) - Math.round(width * 0.08), width: Math.round(width * 0.16), height: Math.round(width * 0.16), borderRadius: 999, background: accent, border: "5px solid #ffffff", boxShadow: "0 6px 14px rgba(0,0,0,0.2)" }} />
    </div>
  );
}

const invitation: Template = {
  id: "invitation",
  name: "招待状型",
  description: "「◯◯から招待状が届きました」の帯と封筒ビジュアル。特別扱いで自分事化する。",
  hooks: ["invitation"],
  spec: SPECS,
  fontSizes(size) {
    const L = layoutFor(size);
    return { headline: L.f.headline, sub: L.f.sub, cta: L.f.cta, eyebrow: L.f.eyebrow };
  },
  render({ brief, creative, size, t }) {
    const L = layoutFor(size);
    const c = resolveColors(brief, creative.slots);
    const s = creative.slots;
    const lit = blinkOn(creative.motion, t);
    const isCursor = normalizeMotion(creative.motion) === "cursor";
    const bg = mix(c.primary, "#ffffff", 0.92);
    const envW = Math.round(L.W * 0.56);
    return (
      <Frame L={L} background={bg} m={motionStyle(creative.motion, t)}>
        <Ribbon text={s.eyebrow || `${brief.brand.logoText}から招待状が届きました`} bg={c.primary} fg={c.onPrimary} L={L} lit={lit} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexGrow: 1, width: L.W, paddingTop: L.pad, paddingBottom: Math.round(L.pad * 0.5), justifyContent: "space-between" }}>
          <Headline text={s.headline} color={c.text} L={L} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <Envelope primary={c.primary} accent={c.accent} label={s.badge || s.sub || "ご招待"} width={envW} />
            {s.badge && s.sub ? (
              <div style={{ display: "flex", marginTop: Math.round(L.pad * 0.5) }}>
                <BadgePill text={s.sub} bg={c.cta} L={L} />
              </div>
            ) : null}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: Math.round(L.f.logo * 0.6) }}>
            <ButtonPair positive={s.cta} negative={s.negative} posBg={c.cta} negBg={c.negative} L={L} lit={lit} pressed={isCursor && t > 0.8} />
            <Logo text={brief.brand.logoText} color={mix(c.text, bg, 0.5)} L={L} />
          </div>
        </div>
        {isCursor ? <Cursor L={L} t={t} hasNegative={!!s.negative} /> : <div style={{ display: "flex" }} />}
      </Frame>
    );
  },
};

// Template 3: campaign (big number) ------------------------------------------

const campaign: Template = {
  id: "campaign",
  name: "キャンペーン型",
  description: "帯 + 大きな数字（バッジ）+ 質問見出し + いいえ／はい。特典・価格の数字が主役。",
  hooks: ["campaign", "price"],
  spec: SPECS,
  fontSizes(size) {
    const L = layoutFor(size);
    return { headline: Math.round(L.f.headline * 0.92), sub: L.f.sub, cta: L.f.cta, eyebrow: L.f.eyebrow };
  },
  render({ brief, creative, size, t, allowImages }) {
    const L = layoutFor(size);
    const c = resolveColors(brief, creative.slots);
    const s = creative.slots;
    const lit = blinkOn(creative.motion, t);
    const isCursor = normalizeMotion(creative.motion) === "cursor";
    const url = allowImages && normalizeVisual(creative.visualAxis) === "photo" ? s.imageUrl : undefined;
    const big = s.badge || "特典";
    const bigSize = Math.round(L.W * (big.length <= 4 ? 0.22 : big.length <= 7 ? 0.16 : 0.11));
    const d = Math.round(L.W * 0.36);
    return (
      <Frame L={L} background={c.background} m={motionStyle(creative.motion, t)}>
        <Ribbon text={s.eyebrow || "キャンペーン実施中"} bg={c.accent} fg={c.onAccent} L={L} lit={lit} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexGrow: 1, width: L.W, paddingTop: Math.round(L.pad * 0.8), paddingBottom: Math.round(L.pad * 0.5), justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: L.W - L.pad * 2 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: c.primary, fontSize: bigSize, fontWeight: 900, lineHeight: 1.05, letterSpacing: -2, textAlign: "center" }}>{big}</div>
            <div style={{ display: "flex", width: Math.round(L.W * 0.3), height: 6, borderRadius: 3, background: c.accent, marginTop: Math.round(L.pad * 0.4), marginBottom: Math.round(L.pad * 0.6) }} />
            <Headline text={s.headline} color={c.text} L={L} size={campaign.fontSizes(size).headline} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            {url ? <PhotoVisual url={url} primary={c.primary} diameter={d} /> : <ArtVisual primary={c.primary} accent={c.accent} label="LINE" diameter={d} />}
            {s.sub ? (
              <div style={{ display: "flex", marginTop: -Math.round(L.f.badge * 1.1) }}>
                <BadgePill text={s.sub} bg={c.primary} L={L} />
              </div>
            ) : null}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: Math.round(L.f.logo * 0.6) }}>
            <ButtonPair positive={s.cta} negative={s.negative} posBg={c.cta} negBg={c.negative} L={L} lit={lit} pressed={isCursor && t > 0.8} />
            <Logo text={brief.brand.logoText} color={mix(c.text, c.background, 0.5)} L={L} />
          </div>
        </div>
        {isCursor ? <Cursor L={L} t={t} hasNegative={!!s.negative} /> : <div style={{ display: "flex" }} />}
      </Frame>
    );
  },
};

// Template 4: multi-choice --------------------------------------------------

const choice: Template = {
  id: "choice",
  name: "多択型",
  description: "質問見出しの下に選択肢ボタンを 2〜3 本。会話の最初の質問をそのまま置く。",
  hooks: ["type_choice", "quiz"],
  spec: SPECS,
  fontSizes(size) {
    const L = layoutFor(size);
    return { headline: L.f.headline, sub: L.f.sub, cta: Math.round(L.f.cta * 0.85), eyebrow: L.f.eyebrow };
  },
  render({ brief, creative, size, t }) {
    const L = layoutFor(size);
    const c = resolveColors(brief, creative.slots);
    const s = creative.slots;
    const lit = blinkOn(creative.motion, t);
    const options = (s.options?.length ? s.options : [s.cta, s.negative].filter(Boolean) as string[]).slice(0, 3);
    const innerW = L.W - L.pad * 2;
    const optH = Math.round(L.buttonH * 0.92);
    return (
      <Frame L={L} background={c.background} m={motionStyle(creative.motion, t)}>
        <Ribbon text={s.eyebrow || "LINEでかんたん診断"} bg={c.primary} fg={c.onPrimary} L={L} lit={lit} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexGrow: 1, width: L.W, paddingTop: L.pad, paddingBottom: Math.round(L.pad * 0.5), justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: Math.round(L.pad * 0.4) }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: Math.round(L.f.headline * 1.1), height: Math.round(L.f.headline * 1.1), borderRadius: 999, background: c.accent, color: c.onAccent, fontSize: Math.round(L.f.headline * 0.6), fontWeight: 900 }}>Q</div>
            <Headline text={s.headline} color={c.text} L={L} />
            {s.sub ? <div style={{ display: "flex", justifyContent: "center", width: innerW, fontSize: L.f.sub, fontWeight: 700, color: mix(c.text, c.background, 0.3), textAlign: "center" }}>{s.sub}</div> : null}
          </div>
          <div style={{ display: "flex", flexDirection: "column", width: innerW, gap: Math.round(L.gap * 0.9) }}>
            {options.map((o, i) => {
              const fill = i === 0 && lit ? mix(c.cta, "#ffffff", 0.2) : c.cta;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative", width: innerW, height: optH, borderRadius: Math.round(optH * 0.18), background: fill, color: readableOn(fill), fontSize: choice.fontSizes(size).cta, fontWeight: 900, boxShadow: `0 8px 0 ${mix(c.cta, "#000000", 0.28)}, 0 14px 24px rgba(0,0,0,0.14)` }}>
                  <div style={{ display: "flex" }}>{o}</div>
                  <div style={{ display: "flex", position: "absolute", right: Math.round(L.pad * 0.6), top: 0, bottom: 0, alignItems: "center", fontSize: Math.round(optH * 0.4), fontWeight: 900, opacity: 0.9 }}>›</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: Math.round(L.f.logo * 0.6) }}>
            {s.badge ? <BadgePill text={s.badge} bg={c.primary} L={L} /> : <div style={{ display: "flex" }} />}
            <Logo text={brief.brand.logoText} color={mix(c.text, c.background, 0.5)} L={L} />
          </div>
        </div>
        <div style={{ display: "flex" }} />
      </Frame>
    );
  },
};

export const TEMPLATES: Template[] = [question, invitation, campaign, choice];

const LEGACY_TEMPLATE: Record<string, LayoutId> = { "image-hero": "question", "text-bold": "question", coupon: "campaign" };

export function getTemplate(id: string): Template {
  const mapped = LEGACY_TEMPLATE[id] ?? id;
  return TEMPLATES.find((t) => t.id === mapped) ?? question;
}

/** Layout for a hook. Visual style is orthogonal (art / photo) and handled inside the template. */
export function templateForHook(hook: AppealAxis): Template {
  return TEMPLATES.find((t) => t.hooks.includes(hook)) ?? question;
}

/** Kept for callers that only know the visual axis. */
export function templateForVisual(visual: VisualAxis): Template {
  void visual;
  return question;
}
