import { zipSync, strToU8 } from "fflate";
import { db } from "@/lib/store";
import { renderCreative } from "@/lib/render";
import { runPreflight } from "@/lib/preflight";
import { SPECS } from "@/lib/templates";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Export approved creatives (or all, when none are approved yet) as a ZIP with
 * PNG/GIF files and a manifest for the delivery platform.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brief = await db.briefs.get(id);
  if (!brief) return new Response("not found", { status: 404 });
  const all = await db.creatives.listByBrief(id);
  const approved = all.filter((c) => c.status === "approved" || c.status === "live");
  const targets = approved.length ? approved : all;
  if (!targets.length) return new Response("no creatives", { status: 404 });

  const files: Record<string, Uint8Array> = {};
  const manifest = [];
  for (const c of targets) {
    const fmt = c.motion === "static" ? "png" : "gif";
    const out = await renderCreative(brief, c, { format: fmt });
    const ext = out.contentType === "image/gif" ? "gif" : "png";
    const name = `${c.appealAxis}_${c.visualAxis}_${c.motion}_v${c.version}_${c.id}.${ext}`;
    files[name] = out.bytes;
    const pre = runPreflight(brief, c, { format: ext, size: out.bytes.byteLength });
    manifest.push({
      creative_id: c.id,
      file: name,
      format: ext,
      width: out.width,
      height: out.height,
      frames: out.frames,
      bytes: out.bytes.byteLength,
      status: c.status,
      appeal_axis: c.appealAxis,
      visual_axis: c.visualAxis,
      motion: c.motion,
      template: c.templateId,
      hypothesis: c.hypothesis,
      slots: c.slots,
      preflight_score: pre.score,
      preflight_issues: pre.issues.map((i) => i.code),
      // Attribution parameter to append to the LINE add-friend URL.
      tracking_param: `zc=${c.id}`,
    });
  }
  files["manifest.json"] = strToU8(
    JSON.stringify(
      {
        exported_at: new Date().toISOString(),
        client: brief.clientName,
        brief_id: brief.id,
        lp_url: brief.lpUrl,
        device: brief.deviceSize,
        spec: SPECS[brief.deviceSize],
        creatives: manifest,
      },
      null,
      2,
    ),
  );
  const zip = zipSync(files, { level: 6 });
  return new Response(Buffer.from(zip), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${brief.clientName}_popups.zip`)}`,
    },
  });
}
