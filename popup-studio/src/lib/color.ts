// Small color utilities shared by templates and preflight.

export function normalizeHex(hex: string, fallback = "#000000") {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return fallback;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return `#${h.toLowerCase()}`;
}

export function hexToRgb(hex: string) {
  const h = normalizeHex(hex).slice(1);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function channel(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.x contrast ratio (1..21). */
export function contrast(fg: string, bg: string) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** Pick black or white text for a given background. */
export function readableOn(bg: string) {
  return contrast("#ffffff", bg) >= contrast("#111111", bg) ? "#ffffff" : "#111111";
}

export function mix(hexA: string, hexB: string, t: number) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `#${[c(a.r, b.r), c(a.g, b.g), c(a.b, b.b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// HSL helpers ---------------------------------------------------------------

export function hexToHsl(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return { h, s, l };
}

export function hslToHex(h: number, s: number, l: number) {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (hh < 60) [r, g, b] = [c, x, 0];
  else if (hh < 120) [r, g, b] = [x, c, 0];
  else if (hh < 180) [r, g, b] = [0, c, x];
  else if (hh < 240) [r, g, b] = [0, x, c];
  else if (hh < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function hueDistance(a: string, b: string) {
  const d = Math.abs(hexToHsl(a).h - hexToHsl(b).h) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Make a color usable as a button fill: enough contrast for white text and not washed out.
 * Keeps the hue (a pale blue becomes a vivid blue, not a grey) and lifts saturation.
 */
export function ensureButtonColor(hex: string, minContrast = 4.5) {
  const { h, s, l } = hexToHsl(normalizeHex(hex));
  const isYellow = h >= 40 && h <= 75; // yellows stay light and take dark text
  const S = Math.max(s, 0.6);
  let L = Math.min(l, isYellow ? 0.62 : 0.52);
  let c = hslToHex(h, S, L);
  const ok = (x: string) => Math.max(contrast("#ffffff", x), contrast("#111111", x)) >= minContrast;
  for (let i = 0; i < 20 && !ok(c); i++) {
    L -= 0.04;
    c = hslToHex(h, S, L);
  }
  return c;
}

/**
 * Button color for a brand whose accent is missing or too close to its primary.
 * Picks from hues designers actually use for CTAs (warm first), the first that sits far
 * enough from the primary hue. A raw hue+180 complement gives mustard on blue brands.
 */
const CTA_PALETTE = ["#f0642d", "#e5484d", "#e0317a", "#1fa66a", "#2f6fed", "#7c4dff"];
export function complementaryButton(primary: string) {
  // Greys and near-blacks have no meaningful hue: any warm CTA works, take the first.
  const pick = saturation(primary) < 0.12 ? CTA_PALETTE[0] : (CTA_PALETTE.find((c) => hueDistance(c, primary) >= 60) ?? "#e5484d");
  return ensureButtonColor(pick);
}

/** Saturation (0..1) in HSL terms, used to skip greys when extracting brand colors. */
export function saturation(hex: string) {
  return hexToHsl(hex).s;
}
