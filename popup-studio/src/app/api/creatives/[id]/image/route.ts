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
    const headers: Record<string, string> = {
      "content-type": out.contentType,
      "cache-control": "private, max-age=300",
      "x-frames": String(out.frames),
    };
    if (download) headers["content-disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;
    return new Response(Buffer.from(out.bytes), { headers });
  } catch (err) {
    console.error("render failed", err);
    return new Response(`render failed: ${(err as Error).message}`, { status: 500 });
  }
}
