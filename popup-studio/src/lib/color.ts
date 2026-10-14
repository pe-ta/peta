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

/** Saturation (0..1) in HSL terms, used to skip greys when extracting brand colors. */
export function saturation(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  if (max === min) return 0;
  const d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}
