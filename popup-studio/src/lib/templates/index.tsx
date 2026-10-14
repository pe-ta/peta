/* eslint-disable @next/next/no-img-element */
import type { ReactElement } from "react";
import type { Brief, Creative, CreativeSlots, Motion } from "../types";
import { contrast, mix, normalizeHex, readableOn } from "../color";

/**
 * Templates are code. Each template is a function of (slots, animation progress)
 * returning Satori-compatible JSX (flexbox only, inline styles).
 * Text is always rendered here, never inside generated images.
 */

export interface TemplateSpec {
  width: number;
  height: number;
  maxBytesPng: number;
  maxBytesGif: number;
  /** Minimum font size in px we consider legible for this size. */
  minFontPx: number;
  headlineMaxChars: number;
  subMaxChars: number;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  visualAxis: "image" | "text";
  spec: Record<"sp" | "pc", TemplateSpec>;
  /** Font sizes the template uses, exposed for preflight. */
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
  // Defaults until the ZEALS delivery spec is confirmed (requirements Q2).
  sp: { width: 640, height: 800, maxBytesPng: 500_000, maxBytesGif: 1_000_000, minFontPx: 22, headlineMaxChars: 22, subMaxChars: 40 },
  pc: { width: 800, height: 500, maxBytesPng: 500_000, maxBytesGif: 1_000_000, minFontPx: 18, headlineMaxChars: 26, subMaxChars: 48 },
};

export function resolveColors(brief: Brief, slots: CreativeSlots) {
  const primary = normalizeHex(slots.primary ?? brief.brand.primary, "#0b6e4f");
  const accent = normalizeHex(slots.accent ?? brief.brand.accent, "#e5484d");
  const background = normalizeHex(slots.background ?? brief.brand.background, "#ffffff");
  const text = normalizeHex(slots.text ?? brief.brand.text, "#1a1a1a");
  return {
    primary,
    accent,
    background,
    text,
    onPrimary: readableOn(primary),
    onAccent: readableOn(accent),
    // The CTA uses whichever of primary/accent is more readable against the body background.
    cta: contrast(primary, background) >= contrast(accent, background) ? primary : accent,
  };
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

/** Returns transform/opacity for the card given motion + progress. */
export function motionStyle(motion: Motion, t: number): { transform?: string; opacity?: number } {
  const p = Math.max(0, Math.min(1, t));
  switch (motion) {
    case "pop": {
      const s = 0.7 + 0.3 * easeOutBack(p);
      return { transform: `scale(${s.toFixed(3)})`, opacity: Math.min(1, p * 2) };
    }
    case "slide": {
      const y = Math.round((1 - easeOutCubic(p)) * 90);
      return { transform: `translateY(${y}px)`, opacity: Math.min(1, 0.2 + p) };
    }
    default:
      return {};
  }
}

/** CTA scale for the pulse loop. */
export function pulseScale(motion: Motion, t: number) {
  if (motion !== "pulse") return 1;
  return 1 + 0.06 * Math.sin(t * Math.PI * 2) ** 2;
}

// Template 1: image hero ----------------------------------------------------

const imageHero: Template = {
  id: "image-hero",
  name: "画像主体型",
  description: "上半分にビジュアル、下半分に訴求とCTA。LP素材や商品写真を活かす。",
  visualAxis: "image",
  spec: SPECS,
  fontSizes(size) {
    return size === "sp"
      ? { headline: 44, sub: 26, cta: 30, eyebrow: 22 }
      : { headline: 36, sub: 20, cta: 24, eyebrow: 18 };
  },
  render({ brief, creative, size, t, allowImages }) {
    const spec = SPECS[size];
    const c = resolveColors(brief, creative.slots);
    const f = imageHero.fontSizes(size);
    const s = creative.slots;
    const m = motionStyle(creative.motion, t);
    const horizontal = size === "pc";
    const imageUrl = allowImages ? s.imageUrl : undefined;
    const ctaScale = pulseScale(creative.motion, t);

    const imageBlock = (
      <div
        style={{
          display: "flex",
          position: "relative",
          width: horizontal ? Math.round(spec.width * 0.48) : spec.width,
          height: horizontal ? spec.height : Math.round(spec.height * 0.46),
          flexShrink: 0,
          background: `linear-gradient(135deg, ${mix(c.primary, "#ffffff", 0.15)}, ${mix(c.primary, "#000000", 0.25)})`,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {imageUrl ? (
          <img src={imageUrl} alt="" width={spec.width} height={spec.height} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ display: "flex", color: c.onPrimary, fontSize: f.eyebrow, opacity: 0.8 }}>{brief.brand.logoText}</div>
        )}
        {s.badge ? (
          <div
            style={{
              position: "absolute",
              top: 20,
              left: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: size === "sp" ? 140 : 110,
              height: size === "sp" ? 140 : 110,
              borderRadius: 999,
              background: c.accent,
              color: c.onAccent,
              fontSize: size === "sp" ? 34 : 26,
              fontWeight: 900,
              textAlign: "center",
              lineHeight: 1.1,
              transform: "rotate(-8deg)",
            }}
          >
            {s.badge}
          </div>
        ) : null}
      </div>
    );

    const textBlock = (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          // No percentage width here: Satori sizes `width: 100%` + padding as content-box,
          // which lets text overflow. Let the block stretch/grow instead.
          flexGrow: 1,
          flexBasis: 0,
          minWidth: 0,
          paddingTop: size === "sp" ? 32 : 28,
          paddingRight: size === "sp" ? 36 : 32,
          paddingBottom: size === "sp" ? 36 : 28,
          paddingLeft: size === "sp" ? 36 : 32,
          color: c.text,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: size === "sp" ? 14 : 10 }}>
          <div style={{ display: "flex", fontSize: f.eyebrow, fontWeight: 700, color: c.primary, letterSpacing: 1 }}>{s.eyebrow}</div>
          <div style={{ display: "flex", fontSize: f.headline, fontWeight: 900, lineHeight: 1.25, letterSpacing: -0.5 }}>{s.headline}</div>
          <div style={{ display: "flex", fontSize: f.sub, lineHeight: 1.5, opacity: 0.9 }}>{s.sub}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: size === "sp" ? 84 : 64,
              borderRadius: 16,
              background: c.cta,
              color: readableOn(c.cta),
              fontSize: f.cta,
              fontWeight: 900,
              transform: `scale(${ctaScale.toFixed(3)})`,
              boxShadow: `0 10px 24px ${mix(c.cta, "#000000", 0.4)}66`,
            }}
          >
            {s.cta}
          </div>
          <div style={{ display: "flex", justifyContent: "center", fontSize: size === "sp" ? 18 : 14, opacity: 0.6 }}>
            {brief.brand.logoText}
          </div>
        </div>
      </div>
    );

    return (
      <div
        style={{
          display: "flex",
          width: spec.width,
          height: spec.height,
          background: "transparent",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Noto Sans JP",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: horizontal ? "row" : "column",
            width: spec.width,
            height: spec.height,
            background: c.background,
            borderRadius: 28,
            overflow: "hidden",
            ...m,
          }}
        >
          {imageBlock}
          {textBlock}
        </div>
      </div>
    );
  },
};

// Template 2: bold text -----------------------------------------------------

const textBold: Template = {
  id: "text-bold",
  name: "テキスト主体型",
  description: "ブランドカラーの面に大きな見出し。オファーと数字を強く見せる。",
  visualAxis: "text",
  spec: SPECS,
  fontSizes(size) {
    return size === "sp"
      ? { headline: 56, sub: 28, cta: 32, eyebrow: 24 }
      : { headline: 44, sub: 22, cta: 26, eyebrow: 18 };
  },
  render({ brief, creative, size, t }) {
    const spec = SPECS[size];
    const c = resolveColors(brief, creative.slots);
    const f = textBold.fontSizes(size);
    const s = creative.slots;
    const m = motionStyle(creative.motion, t);
    const ctaScale = pulseScale(creative.motion, t);
    const bg = c.primary;
    const fg = c.onPrimary;
    const ctaBg = contrast(c.accent, bg) >= 2.5 ? c.accent : readableOn(bg) === "#ffffff" ? "#ffffff" : "#111111";

    return (
      <div
        style={{
          display: "flex",
          width: spec.width,
          height: spec.height,
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Noto Sans JP",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: spec.width,
            height: spec.height,
            paddingTop: size === "sp" ? 44 : 32,
            paddingRight: 40,
            paddingBottom: size === "sp" ? 40 : 32,
            paddingLeft: 40,
            background: `linear-gradient(160deg, ${mix(bg, "#ffffff", 0.08)} 0%, ${bg} 55%, ${mix(bg, "#000000", 0.18)} 100%)`,
            color: fg,
            borderRadius: 28,
            overflow: "hidden",
            ...m,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div
              style={{
                display: "flex",
                fontSize: f.eyebrow,
                fontWeight: 700,
                padding: "6px 16px",
                borderRadius: 999,
                border: `2px solid ${fg}`,
                letterSpacing: 1,
              }}
            >
              {s.eyebrow}
            </div>
            <div style={{ display: "flex", fontSize: f.eyebrow, fontWeight: 700, opacity: 0.85 }}>{brief.brand.logoText}</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: size === "sp" ? 18 : 12 }}>
            {s.badge ? (
              <div
                style={{
                  display: "flex",
                  alignSelf: "flex-start",
                  fontSize: size === "sp" ? 72 : 56,
                  fontWeight: 900,
                  lineHeight: 1,
                  color: ctaBg === "#ffffff" || ctaBg === "#111111" ? fg : ctaBg,
                  letterSpacing: -2,
                }}
              >
                {s.badge}
              </div>
            ) : null}
            <div style={{ display: "flex", fontSize: f.headline, fontWeight: 900, lineHeight: 1.2, letterSpacing: -1 }}>{s.headline}</div>
            <div style={{ display: "flex", fontSize: f.sub, lineHeight: 1.5, opacity: 0.92 }}>{s.sub}</div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: size === "sp" ? 88 : 64,
              borderRadius: 999,
              background: ctaBg,
              color: readableOn(ctaBg),
              fontSize: f.cta,
              fontWeight: 900,
              transform: `scale(${ctaScale.toFixed(3)})`,
              boxShadow: "0 12px 28px rgba(0,0,0,0.25)",
            }}
          >
            {s.cta}
          </div>
        </div>
      </div>
    );
  },
};

export const TEMPLATES: Template[] = [imageHero, textBold];

export function getTemplate(id: string): Template {
  return TEMPLATES.find((t) => t.id === id) ?? textBold;
}

export function templateForVisual(visual: "image" | "text"): Template {
  return TEMPLATES.find((t) => t.visualAxis === visual) ?? textBold;
}
