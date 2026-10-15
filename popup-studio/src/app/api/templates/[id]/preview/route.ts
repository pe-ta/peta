import { NextRequest } from "next/server";
import { getTemplate, TEMPLATES } from "@/lib/templates";
import { renderCreative } from "@/lib/render";
import { fallbackCopy } from "@/lib/ai";
import type { Brief, Creative } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Gallery preview: each template rendered with a sample brief and rule-based copy. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!TEMPLATES.some((t) => t.id === id)) return new Response("unknown template", { status: 404 });
  const template = getTemplate(id);
  const brief: Brief = {
    id: "br_sample",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    winMetric: "line_add_rate",
    clientName: "サンプル塾",
    industry: "教育・スクール",
    lpUrl: "",
    offer: "春期講習 無料体験",
    target: "小学生の保護者、塾を比較中",
    exitContext: "料金ページで戻る操作",
    deviceSize: "sp",
    brand: { primary: "#1d5fb4", accent: "#f28c1b", background: "#ffffff", text: "#1a1a1a", logoText: "サンプル塾", ngWords: [], tone: "" },
    appealAxes: [],
    visualAxes: ["art"],
    motions: ["static"],
    copySource: "fallback",
  };
  const hook = template.hooks[0];
  const v = fallbackCopy(brief, [hook])[0];
  const creative: Creative = {
    id: `cr_sample_${template.id}`,
    briefId: brief.id,
    createdAt: brief.createdAt,
    updatedAt: brief.updatedAt,
    templateId: template.id,
    appealAxis: hook,
    visualAxis: "art",
    motion: "static",
    hypothesis: v.hypothesis,
    slots: { eyebrow: v.eyebrow, headline: v.headline, sub: v.sub, cta: v.cta, negative: template.id === "choice" || template.id === "tiles" ? undefined : v.negative || undefined, badge: v.badge || undefined, options: template.id === "choice" || template.id === "tiles" ? (v.options?.length ? v.options : ["価格の安さ", "サポートの手厚さ"]) : undefined },
    status: "draft",
    version: 1,
  };
  const out = await renderCreative(brief, creative, { format: "png", scale: 0.5 });
  return new Response(Buffer.from(out.bytes), { headers: { "content-type": "image/png", "cache-control": "public, max-age=3600" } });
}
