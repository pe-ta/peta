import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import satori, { type Font as FontOptions } from "satori";
import { Resvg } from "@resvg/resvg-js";
import { GIFEncoder, quantize, applyPalette } from "gifenc";
import type { Brief, Creative } from "./types";
import { getTemplate, SPECS } from "./templates";

/**
 * Rendering pipeline: JSX template -> Satori (SVG, text as glyph paths)
 * -> resvg (PNG / RGBA) -> optional GIF encoding (gifenc).
 */

let fontsPromise: Promise<FontOptions[]> | null = null;

async function loadFonts(): Promise<FontOptions[]> {
  if (!fontsPromise) {
    fontsPromise = (async () => {
      // Fonts are vendored under assets/ so Vercel's file tracing bundles them with the
      // render functions (node_modules paths are not reliably traced for runtime reads).
      const dir = path.join(process.cwd(), "assets/fonts");
      const weights: Array<400 | 700 | 900> = [400, 700, 900];
      const fonts = await Promise.all(
        weights.map(async (w) => ({
          name: "Noto Sans JP",
          weight: w,
          style: "normal" as const,
          data: await fs.readFile(path.join(dir, `noto-sans-jp-japanese-${w}-normal.woff`)),
        })),
      );
      return fonts;
    })();
  }
  return fontsPromise;
}

export interface RenderOptions {
  format: "png" | "gif";
  /** Override the spec'd size scale (1 = native). Useful for thumbnails. */
  scale?: number;
}

export interface Rendered {
  bytes: Uint8Array;
  contentType: "image/png" | "image/gif";
  width: number;
  height: number;
  frames: number;
  /** True when the external image could not be fetched and the fallback art was used. */
  degraded: boolean;
}

async function renderSvg(brief: Brief, creative: Creative, t: number, allowImages: boolean) {
  const template = getTemplate(creative.templateId);
  const spec = SPECS[brief.deviceSize];
  const fonts = await loadFonts();
  const element = template.render({ brief, creative, size: brief.deviceSize, t, allowImages });
  return satori(element, { width: spec.width, height: spec.height, fonts });
}

async function renderSvgSafe(brief: Brief, creative: Creative, t: number): Promise<{ svg: string; degraded: boolean }> {
  try {
    return { svg: await renderSvg(brief, creative, t, true), degraded: false };
  } catch (err) {
    // Typically an unreachable image URL. Render without external images.
    if (creative.slots.imageUrl) {
      console.warn("render: retrying without image", (err as Error).message);
      return { svg: await renderSvg(brief, creative, t, false), degraded: true };
    }
    throw err;
  }
}

function rasterize(svg: string, width: number, scale: number) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: Math.round(width * scale) },
    font: { loadSystemFonts: false },
  });
  return resvg.render();
}

/** Frame schedule per motion: [progress, delayMs][] */
function frameSchedule(motion: Creative["motion"]): Array<[number, number]> {
  switch (motion) {
    case "pop":
    case "slide": {
      const n = 14;
      const frames: Array<[number, number]> = [];
      for (let i = 0; i < n; i++) frames.push([i / (n - 1), 60]);
      frames[frames.length - 1][1] = 2800; // hold the resting state
      return frames;
    }
    case "pulse": {
      const n = 12;
      const frames: Array<[number, number]> = [];
      for (let i = 0; i < n; i++) frames.push([i / n, 90]);
      return frames;
    }
    default:
      return [[1, 0]];
  }
}

// Small in-memory cache so thumbnails and downloads of the same version are instant.
const cache = new Map<string, Rendered>();
const CACHE_MAX = 60;

export async function renderCreative(brief: Brief, creative: Creative, opts: RenderOptions): Promise<Rendered> {
  const key = [creative.id, creative.version, brief.updatedAt, opts.format, opts.scale ?? 1].join("|");
  const hit = cache.get(key);
  if (hit) return hit;
  const out = await renderUncached(brief, creative, opts);
  // Don't pin a degraded render in memory: the image host may be back on the next request.
  if (!out.degraded) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(key, out);
  }
  return out;
}

async function renderUncached(brief: Brief, creative: Creative, opts: RenderOptions): Promise<Rendered> {
  const spec = SPECS[brief.deviceSize];
  const scale = opts.scale ?? 1;
  const effectiveFormat = opts.format === "gif" && creative.motion === "static" ? "png" : opts.format;

  if (effectiveFormat === "png") {
    const { svg, degraded } = await renderSvgSafe(brief, creative, 1);
    const img = rasterize(svg, spec.width, scale);
    return { bytes: img.asPng(), contentType: "image/png", width: img.width, height: img.height, frames: 1, degraded };
  }

  const schedule = frameSchedule(creative.motion);
  const gif = GIFEncoder();
  let width = 0;
  let height = 0;
  let degraded = false;
  for (let i = 0; i < schedule.length; i++) {
    const [t, delay] = schedule[i];
    const r = await renderSvgSafe(brief, creative, t);
    degraded ||= r.degraded;
    const img = rasterize(r.svg, spec.width, scale);
    width = img.width;
    height = img.height;
    const rgba = img.pixels;
    // Composite the transparent canvas onto white so GIF (no alpha blending) looks right.
    const flat = new Uint8Array(rgba.length);
    for (let p = 0; p < rgba.length; p += 4) {
      const a = rgba[p + 3] / 255;
      flat[p] = Math.round(rgba[p] * a + 255 * (1 - a));
      flat[p + 1] = Math.round(rgba[p + 1] * a + 255 * (1 - a));
      flat[p + 2] = Math.round(rgba[p + 2] * a + 255 * (1 - a));
      flat[p + 3] = 255;
    }
    const palette = quantize(flat, 256, { format: "rgb565" });
    const index = applyPalette(flat, palette, "rgb565");
    gif.writeFrame(index, width, height, { palette, delay, repeat: 0 });
  }
  gif.finish();
  return { bytes: gif.bytes(), contentType: "image/gif", width, height, frames: schedule.length, degraded };
}
