import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/store";
import { applyResults, parseResultsJson, parseResultsText, verifyResultsToken } from "@/lib/results";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Push API for delivery results, so the delivery platform (or a scheduled script)
 * can send numbers without anyone pasting CSV.
 *
 *   POST /api/briefs/<briefId>/results
 *   Authorization: Bearer <token shown on the brief page>
 *   Content-Type: text/csv  (header + rows)   or   application/json ([{creative_id,date,impressions,clicks,line_adds,conversions}])
 *
 * Values are cumulative to the row's date. Responds with counts; unknown creative ids are ignored and listed.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim() || req.nextUrl.searchParams.get("token") || "";
  if (!token || !verifyResultsToken(id, token)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const brief = await db.briefs.get(id);
  if (!brief) return Response.json({ error: "brief not found" }, { status: 404 });

  const type = req.headers.get("content-type") ?? "";
  let parsed: ReturnType<typeof parseResultsText>;
  try {
    parsed = type.includes("json") ? parseResultsJson(await req.json()) : parseResultsText(await req.text());
  } catch (err) {
    return Response.json({ error: `could not read body: ${err instanceof Error ? err.message : String(err)}` }, { status: 400 });
  }
  if (parsed.error) return Response.json({ error: parsed.error }, { status: 400 });
  if (parsed.rows.length === 0) return Response.json({ error: "no rows" }, { status: 400 });
  const r = await applyResults(id, parsed.rows, "csv");
  revalidatePath(`/briefs/${id}`);
  revalidatePath("/");
  return Response.json({ ok: true, ...r });
}
