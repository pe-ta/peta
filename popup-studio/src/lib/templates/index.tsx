/* eslint-disable @next/next/no-img-element */
import type { ReactElement } from "react";
import type { Brief, Creative, CreativeSlots, Motion, VisualAxis } from "../types";
import { complementaryButton, contrast, ensureButtonColor, hueDistance, mix, normalizeHex, readableOn, saturation } from "../color";

/**
 * Templates are code. Each template is a function of (slots, animation progress)
 * returning Satori-compatible JSX (flexbox only, inline styles).
 * Text is always rendered here, never inside generated images.
 *
 * Satori gotchas honoured below:
 * - `width: 100%` + padding sizes the content box, so text blocks use flexGrow instead.
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
}

export interface Template {
  id: string;
  name: string;
  description: string;
  visualAxis: VisualAxis;
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
  // Defaults until the ZEALS delivery spec is confirmed (requirements Q2).
  sp: { width: 640, height: 800, maxBytesPng: 500_000, maxBytesGif: 1_000_000, minFontPx: 22, headlineMaxChars: 20, subMaxChars: 40 },
  pc: { width: 800, height: 500, maxBytesPng: 500_000, maxBytesGif: 1_000_000, minFontPx: 18, headlineMaxChars: 24, subMaxChars: 48 },
};

export interface ResolvedColors {
  primary: string;
  accent: string;
  background: string;
  text: string;
  onPrimary: string;
  onAccent: string;
  /** Button fill guaranteed to carry white text on a light surface. */
  cta: string;
  /** Button fill for use on a primary-colored surface. */
  ctaOnPrimary: string;
}

export function resolveColors(brief: Brief, slots: CreativeSlots): ResolvedColors {
  const primary = normalizeHex(slots.primary ?? brief.brand.primary, "#0b6e4f");
  const accentRaw = normalizeHex(slots.accent ?? brief.brand.accent, "#e5484d");
  const background = normalizeHex(slots.background ?? brief.brand.background, "#ffffff");
  const text = normalizeHex(slots.text ?? brief.brand.text, "#1a1a1a");
  // The accent drives the CTA. Two failure modes seen with colors pulled from LPs:
  // a pale tint (weak button) and a near-duplicate of the primary (button disappears on the
  // primary surface). Fix the first by deepening in HSL; fix the second with a complement.
  const primaryIsGrey = saturation(primary) < 0.12;
  const tooClose = saturation(accentRaw) < 0.15 || (!primaryIsGrey && hueDistance(accentRaw, primary) < 25);
  const accent = tooClose ? complementaryButton(primary) : ensureButtonColor(accentRaw);
  const cta = contrast(accent, background) >= 3 ? accent : ensureButtonColor(primary);
  const ctaOnPrimary = contrast(accent, primary) >= 2.5 ? accent : readableOn(primary) === "#ffffff" ? "#ffffff" : "#111111";
  return { primary, accent, background, text, onPrimary: readableOn(primary), onAccent: readableOn(accent), cta, ctaOnPrimary };
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

export function pulseScale(motion: Motion, t: number) {
  if (motion !== "pulse") return 1;
  return 1 + 0.06 * Math.sin(t * Math.PI * 2) ** 2;
}

// Shared pieces -------------------------------------------------------------

const FONT = "Noto Sans JP";

/** Primary button with a chevron. Satori needs explicit flex on the row. */
function CtaButton({ label, bg, height, fontSize, scale, radius = 18 }: { label: string; bg: string; height: number; fontSize: number; scale: number; radius?: number }) {
  const fg = readableOn(bg);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        height,
        borderRadius: radius,
        background: bg,
        color: fg,
        fontSize,
        fontWeight: 900,
        letterSpacing: 0.5,
        transform: `scale(${scale.toFixed(3)})`,
        boxShadow: `0 10px 24px ${mix(bg, "#000000", 0.35)}73`,
      }}
    >
      <div style={{ display: "flex" }}>{label}</div>
      <div style={{ display: "flex", position: "absolute", right: 22, top: 0, bottom: 0, alignItems: "center", fontSize: fontSize * 1.1, fontWeight: 900, opacity: 0.9 }}>›</div>
    </div>
  );
}

/** Decorative hero used when no product image is available: soft shapes + a chat bubble. */
function HeroArt({ primary, width, height, label }: { primary: string; width: number; height: number; label: string }) {
  const light = mix(primary, "#ffffff", 0.35);
  const dark = mix(primary, "#000000", 0.3);
  const bubble = "#ffffff";
  return (
    <div style={{ display: "flex", position: "relative", width, height, background: `linear-gradient(135deg, ${light} 0%, ${primary} 55%, ${dark} 100%)`, overflow: "hidden" }}>
      <div style={{ position: "absolute", right: -width * 0.12, top: -height * 0.2, width: width * 0.55, height: width * 0.55, borderRadius: 999, background: mix(primary, "#ffffff", 0.18), opacity: 0.55 }} />
      <div style={{ position: "absolute", left: -width * 0.1, bottom: -height * 0.3, width: width * 0.42, height: width * 0.42, borderRadius: 999, background: mix(primary, "#000000", 0.2), opacity: 0.5 }} />
      {/* Chat bubble sized to its text (max 80% width), with a tail below-left. */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", maxWidth: width * 0.8 }}>
          <div
            style={{
              display: "flex",
              paddingTop: Math.round(height * 0.06),
              paddingBottom: Math.round(height * 0.06),
              paddingLeft: Math.round(width * 0.07),
              paddingRight: Math.round(width * 0.07),
              borderRadius: 36,
              background: bubble,
              color: primary,
              fontSize: Math.round(height * 0.11),
              fontWeight: 900,
              letterSpacing: 0.5,
              whiteSpace: "nowrap",
              boxShadow: "0 18px 40px rgba(0,0,0,0.25)",
            }}
          >
            {label}
          </div>
          <div style={{ display: "flex", marginLeft: 34, marginTop: -16, width: 32, height: 32, background: bubble, transform: "rotate(45deg)", borderRadius: 6 }} />
        </div>
      </div>
    </div>
  );
}

function Badge({ text, accent, size, rotate = -8 }: { text: string; accent: string; size: number; rotate?: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: 999,
        background: accent,
        color: readableOn(accent),
        fontSize: Math.round(size * 0.26),
        fontWeight: 900,
        textAlign: "center",
        lineHeight: 1.05,
        letterSpacing: -0.5,
        transform: `rotate(${rotate}deg)`,
        boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
        border: "4px solid #ffffff",
      }}
    >
      {text}
    </div>
  );
}

/** True when the badge text already appears in the headline (avoid saying "55%OFF" twice). */
function badgeDuplicatesHeadline(s: CreativeSlots) {
  if (!s.badge) return true;
  const norm = (x: string) => x.replace(/\s/g, "").toUpperCase();
  return norm(s.headline).includes(norm(s.badge));
}

function Frame({ width, height, children }: { width: number; height: number; children: ReactElement }) {
  return (
    <div style={{ display: "flex", width, height, alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
      {children}
    </div>
  );
}

// Template 1: image hero ----------------------------------------------------

const imageHero: Template = {
  id: "image-hero",
  name: "画像主体型",
  description: "上半分にビジュアル、下半分に訴求とCTA。LP素材や商品写真を活かす。画像が無い場合はブランド色の装飾になる。",
  visualAxis: "image",
  spec: SPECS,
  fontSizes(size) {
    return size === "sp" ? { headline: 44, sub: 25, cta: 30, eyebrow: 22 } : { headline: 34, sub: 19, cta: 24, eyebrow: 17 };
  },
  render({ brief, creative, size, t, allowImages }) {
    const spec = SPECS[size];
    const c = resolveColors(brief, creative.slots);
    const f = imageHero.fontSizes(size);
    const s = creative.slots;
    const m = motionStyle(creative.motion, t);
    const horizontal = size === "pc";
    const imageUrl = allowImages ? s.imageUrl : undefined;
    const imgW = horizontal ? Math.round(spec.width * 0.46) : spec.width;
    const imgH = horizontal ? spec.height : Math.round(spec.height * 0.44);
    const badgeSize = size === "sp" ? 150 : 112;

    const imageBlock = (
      <div style={{ display: "flex", position: "relative", width: imgW, height: imgH, flexShrink: 0, overflow: "hidden" }}>
        {imageUrl ? (
          <img src={imageUrl} alt="" width={imgW} height={imgH} style={{ width: imgW, height: imgH, objectFit: "cover" }} />
        ) : (
          // Without a photo, the bubble carries the number (or a LINE cue) so the badge is not drawn twice.
          <HeroArt primary={c.primary} width={imgW} height={imgH} label={s.badge || "LINEで受け取る"} />
        )}
        {s.badge && imageUrl && !badgeDuplicatesHeadline(s) ? (
          <div style={{ position: "absolute", top: 18, left: 18, display: "flex" }}>
            <Badge text={s.badge} accent={c.accent} size={badgeSize} />
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
          flexGrow: 1,
          flexBasis: 0,
          minWidth: 0,
          paddingTop: size === "sp" ? 30 : 26,
          paddingRight: size === "sp" ? 36 : 30,
          paddingBottom: size === "sp" ? 30 : 24,
          paddingLeft: size === "sp" ? 36 : 30,
          color: c.text,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: size === "sp" ? 12 : 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", width: 6, height: f.eyebrow, borderRadius: 3, background: c.accent }} />
            <div style={{ display: "flex", fontSize: f.eyebrow, fontWeight: 700, color: c.primary, letterSpacing: 1 }}>{s.eyebrow}</div>
          </div>
          <div style={{ display: "flex", fontSize: f.headline, fontWeight: 900, lineHeight: 1.22, letterSpacing: -0.5 }}>{s.headline}</div>
          <div style={{ display: "flex", fontSize: f.sub, lineHeight: 1.5, color: mix(c.text, c.background, 0.25) }}>{s.sub}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <CtaButton label={s.cta} bg={c.cta} height={size === "sp" ? 84 : 62} fontSize={f.cta} scale={pulseScale(creative.motion, t)} />
          <div style={{ display: "flex", justifyContent: "center", fontSize: size === "sp" ? 16 : 13, color: mix(c.text, c.background, 0.5) }}>{brief.brand.logoText}</div>
        </div>
      </div>
    );

    return (
      <Frame width={spec.width} height={spec.height}>
        <div style={{ display: "flex", flexDirection: horizontal ? "row" : "column", width: spec.width, height: spec.height, background: c.background, borderRadius: 28, overflow: "hidden", ...m }}>
          {imageBlock}
          {textBlock}
        </div>
      </Frame>
    );
  },
};

// Template 2: bold text -----------------------------------------------------

const textBold: Template = {
  id: "text-bold",
  name: "テキスト主体型",
  description: "ブランドカラーの面に大きな見出し。オファーの数字を主役にする。",
  visualAxis: "text",
  spec: SPECS,
  fontSizes(size) {
    return size === "sp" ? { headline: 54, sub: 27, cta: 32, eyebrow: 23 } : { headline: 42, sub: 21, cta: 26, eyebrow: 18 };
  },
  render({ brief, creative, size, t }) {
    const spec = SPECS[size];
    const c = resolveColors(brief, creative.slots);
    const f = textBold.fontSizes(size);
    const s = creative.slots;
    const m = motionStyle(creative.motion, t);
    const bg = c.primary;
    const fg = c.onPrimary;
    const showBadge = !badgeDuplicatesHeadline(s);

    return (
      <Frame width={spec.width} height={spec.height}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            position: "relative",
            width: spec.width,
            height: spec.height,
            paddingTop: size === "sp" ? 40 : 28,
            paddingRight: 40,
            paddingBottom: size === "sp" ? 40 : 28,
            paddingLeft: 40,
            background: `linear-gradient(160deg, ${mix(bg, "#ffffff", 0.1)} 0%, ${bg} 50%, ${mix(bg, "#000000", 0.22)} 100%)`,
            color: fg,
            borderRadius: 28,
            overflow: "hidden",
            ...m,
          }}
        >
          <div style={{ position: "absolute", right: -120, top: -120, width: 320, height: 320, borderRadius: 999, background: mix(bg, "#ffffff", 0.12), opacity: 0.5 }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", fontSize: f.eyebrow, fontWeight: 700, paddingTop: 6, paddingBottom: 6, paddingLeft: 16, paddingRight: 16, borderRadius: 999, border: `2px solid ${fg}`, letterSpacing: 1 }}>
              {s.eyebrow}
            </div>
            <div style={{ display: "flex", fontSize: f.eyebrow, fontWeight: 700, opacity: 0.85 }}>{brief.brand.logoText}</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: size === "sp" ? 16 : 10 }}>
            {showBadge ? (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
                <div style={{ display: "flex", fontSize: size === "sp" ? 96 : 72, fontWeight: 900, lineHeight: 0.95, letterSpacing: -3, color: c.ctaOnPrimary === "#ffffff" || c.ctaOnPrimary === "#111111" ? fg : c.ctaOnPrimary }}>
                  {s.badge}
                </div>
              </div>
            ) : null}
            <div style={{ display: "flex", fontSize: f.headline, fontWeight: 900, lineHeight: 1.2, letterSpacing: -1 }}>{s.headline}</div>
            <div style={{ display: "flex", fontSize: f.sub, lineHeight: 1.5, opacity: 0.92 }}>{s.sub}</div>
          </div>

          <CtaButton label={s.cta} bg={c.ctaOnPrimary} height={size === "sp" ? 88 : 64} fontSize={f.cta} scale={pulseScale(creative.motion, t)} radius={999} />
        </div>
      </Frame>
    );
  },
};

// Template 3: coupon ticket -------------------------------------------------

const coupon: Template = {
  id: "coupon",
  name: "クーポン型",
  description: "チケット風のクーポン。割引・特典の『受け取り』を直感的に伝える。",
  visualAxis: "coupon",
  spec: SPECS,
  fontSizes(size) {
    return size === "sp" ? { headline: 40, sub: 24, cta: 30, eyebrow: 22 } : { headline: 32, sub: 18, cta: 24, eyebrow: 16 };
  },
  render({ brief, creative, size, t }) {
    const spec = SPECS[size];
    const c = resolveColors(brief, creative.slots);
    const f = coupon.fontSizes(size);
    const s = creative.slots;
    const m = motionStyle(creative.motion, t);
    const pad = size === "sp" ? 32 : 28;
    // The ticket is always white, so its text is always dark regardless of the brand background.
    const ticketBg = "#ffffff";
    const ticketText = "#1a1a1a";
    const outer = mix(c.primary, "#ffffff", 0.9);
    const hole = size === "sp" ? 36 : 28;
    const big = s.badge || "特典";

    return (
      <Frame width={spec.width} height={spec.height}>
        <div style={{ display: "flex", flexDirection: "column", width: spec.width, height: spec.height, background: outer, borderRadius: 28, overflow: "hidden", padding: pad, ...m }}>
          {/* header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: size === "sp" ? 16 : 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", width: 10, height: 10, borderRadius: 999, background: c.accent }} />
              <div style={{ display: "flex", fontSize: f.eyebrow, fontWeight: 900, color: c.primary, letterSpacing: 1 }}>{s.eyebrow}</div>
            </div>
            <div style={{ display: "flex", fontSize: f.eyebrow, fontWeight: 700, color: mix(c.primary, "#000000", 0.2), opacity: 0.8 }}>{brief.brand.logoText}</div>
          </div>

          {/* ticket */}
          <div style={{ display: "flex", flexDirection: "column", position: "relative", flexGrow: 1, background: ticketBg, borderRadius: 22, overflow: "hidden", boxShadow: "0 14px 30px rgba(0,0,0,0.12)" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0, height: size === "sp" ? 230 : 150, background: `linear-gradient(135deg, ${c.primary}, ${mix(c.primary, "#000000", 0.25)})`, color: c.onPrimary }}>
              <div style={{ display: "flex", fontSize: size === "sp" ? 20 : 15, fontWeight: 700, opacity: 0.85, letterSpacing: 2 }}>COUPON</div>
              <div style={{ display: "flex", fontSize: size === "sp" ? 104 : 72, fontWeight: 900, lineHeight: 1, letterSpacing: -3 }}>{big}</div>
            </div>
            {/* perforation */}
            <div style={{ display: "flex", position: "relative", height: 0 }}>
              <div style={{ position: "absolute", left: -hole / 2, top: -hole / 2, width: hole, height: hole, borderRadius: 999, background: outer }} />
              <div style={{ position: "absolute", right: -hole / 2, top: -hole / 2, width: hole, height: hole, borderRadius: 999, background: outer }} />
              <div style={{ position: "absolute", left: hole, right: hole, top: -1, borderTop: `3px dashed ${mix(c.primary, "#ffffff", 0.6)}` }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flexGrow: 1, flexBasis: 0, minWidth: 0, paddingTop: size === "sp" ? 26 : 18, paddingLeft: size === "sp" ? 28 : 22, paddingRight: size === "sp" ? 28 : 22, paddingBottom: size === "sp" ? 24 : 18, color: ticketText }}>
              <div style={{ display: "flex", flexDirection: "column", gap: size === "sp" ? 10 : 6 }}>
                <div style={{ display: "flex", fontSize: f.headline, fontWeight: 900, lineHeight: 1.22, letterSpacing: -0.5 }}>{s.headline}</div>
                <div style={{ display: "flex", fontSize: f.sub, lineHeight: 1.5, color: mix(ticketText, "#ffffff", 0.3) }}>{s.sub}</div>
              </div>
              <CtaButton label={s.cta} bg={contrast(c.accent, "#ffffff") >= 3 ? c.accent : ensureButtonColor(c.primary)} height={size === "sp" ? 80 : 58} fontSize={f.cta} scale={pulseScale(creative.motion, t)} />
            </div>
          </div>
        </div>
      </Frame>
    );
  },
};

export const TEMPLATES: Template[] = [imageHero, textBold, coupon];

export function getTemplate(id: string): Template {
  return TEMPLATES.find((t) => t.id === id) ?? textBold;
}

export function templateForVisual(visual: VisualAxis): Template {
  return TEMPLATES.find((t) => t.visualAxis === visual) ?? textBold;
}
