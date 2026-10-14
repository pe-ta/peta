import "server-only";
import { normalizeHex, saturation, luminance } from "./color";

/**
 * Lightweight LP extraction without a headless browser: title, description,
 * og:image, and brand color candidates from the HTML (inline styles and <style>).
 */
export interface LpExtract {
  title?: string;
  description?: string;
  ogImage?: string;
  colors: string[]; // ranked brand color candidates
  headings: string[];
  error?: string;
}

function decode(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function meta(html: string, name: string) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  if (!tag) return undefined;
  return tag.match(/content=["']([^"']*)["']/i)?.[1];
}

export function extractColors(html: string): string[] {
  const counts = new Map<string, number>();
  const re = /#([0-9a-f]{6}|[0-9a-f]{3})\b/gi;
  for (const m of html.matchAll(re)) {
    const hex = normalizeHex(m[0]);
    const sat = saturation(hex);
    const lum = luminance(hex);
    if (sat < 0.25 || lum > 0.85 || lum < 0.03) continue; // skip greys, near-white, near-black
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h).slice(0, 6);
}

export async function extractLp(url: string): Promise<LpExtract> {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) throw new Error("http(s) のURLを指定してください");
    const res = await fetch(u, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; PopupStudio/0.1)", accept: "text/html" },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = (await res.text()).slice(0, 1_500_000);
    const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
    const ogImageRaw = meta(html, "og:image");
    const ogImage = ogImageRaw ? new URL(ogImageRaw, u).toString() : undefined;
    const headings = [...html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)]
      .map((m) => decode(m[1].replace(/<[^>]+>/g, "")))
      .filter((h) => h.length > 1 && h.length < 80)
      .slice(0, 8);
    return {
      title: title ? decode(title) : undefined,
      description: meta(html, "description") ?? meta(html, "og:description"),
      ogImage,
      colors: extractColors(html),
      headings,
    };
  } catch (err) {
    return { colors: [], headings: [], error: (err as Error).message };
  }
}
