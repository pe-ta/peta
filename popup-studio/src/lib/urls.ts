import type { Brief, Creative } from "./types";

/**
 * Image URL for a creative. The version segment must change whenever the rendered
 * bytes can change, because versioned URLs are cached immutably at the CDN:
 * creative.version covers slot edits, the brief stamp covers brand/device edits.
 */
export function creativeImageUrl(creative: Creative, brief: Pick<Brief, "updatedAt">, fmt: "png" | "gif", extra?: Record<string, string>) {
  const stamp = stampOf(brief.updatedAt);
  const q = new URLSearchParams({ fmt, v: `${creative.version}-${stamp}`, ...extra });
  return `/api/creatives/${creative.id}/image?${q.toString()}`;
}

function stampOf(iso: string) {
  // Short, URL-safe digest of the timestamp (FNV-1a), good enough for cache busting.
  let h = 0x811c9dc5;
  for (let i = 0; i < iso.length; i++) {
    h ^= iso.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
