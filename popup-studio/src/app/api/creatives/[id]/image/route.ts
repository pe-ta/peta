import { NextRequest } from "next/server";
import { db } from "@/lib/store";
import { renderCreative } from "@/lib/render";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const creative = await db.creatives.get(id);
  if (!creative) return new Response("not found", { status: 404 });
  const brief = await db.briefs.get(creative.briefId);
  if (!brief) return new Response("not found", { status: 404 });

  const fmt = req.nextUrl.searchParams.get("fmt") === "gif" ? "gif" : "png";
  const scaleParam = Number(req.nextUrl.searchParams.get("scale") ?? "1");
  const scale = Number.isFinite(scaleParam) && scaleParam > 0 && scaleParam <= 2 ? scaleParam : 1;
  const download = req.nextUrl.searchParams.get("download") === "1";

  try {
    const out = await renderCreative(brief, creative, { format: fmt, scale });
    const ext = out.contentType === "image/gif" ? "gif" : "png";
    const filename = `${brief.clientName}_${creative.appealAxis}_${creative.visualAxis}_${creative.motion}_v${creative.version}.${ext}`;
    // URLs carry the creative version, so a rendered image never changes for a given URL:
    // let the CDN cache it for a year. Unversioned requests stay short-lived.
    // A degraded render (image host unreachable) must not be pinned at the CDN.
    const versioned = req.nextUrl.searchParams.has("v") && !out.degraded;
    const headers: Record<string, string> = {
      "content-type": out.contentType,
      "cache-control": versioned ? "public, max-age=3600, s-maxage=31536000, immutable" : "private, max-age=60",
      "x-frames": String(out.frames),
      "x-degraded": out.degraded ? "1" : "0",
    };
    if (download) headers["content-disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;
    return new Response(Buffer.from(out.bytes), { headers });
  } catch (err) {
    console.error("render failed", err);
    return new Response(`render failed: ${(err as Error).message}`, { status: 500 });
  }
}
