import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db, nowIso } from "./store";
import type { Creative, ResultSnapshot } from "./types";

/**
 * Results ingestion shared by the paste form and the push API.
 * Input: CSV/TSV text with a header, or an array of row objects. Values are
 * cumulative to the row's date; the newest row per creative becomes its results.
 */

export interface ResultRow {
  creativeId: string;
  date: string; // YYYY-MM-DD
  impressions: number;
  clicks: number;
  lineAdds: number;
  conversions: number;
  blocks?: number;
}

const COLS: Array<[keyof ResultRow, string[]]> = [
  ["creativeId", ["creative_id", "creativeid", "creative", "zc", "案id", "案 id", "id"]],
  ["date", ["date", "日付", "day"]],
  ["impressions", ["impressions", "impression", "表示", "imp"]],
  ["clicks", ["clicks", "click", "タップ", "クリック", "tap"]],
  ["lineAdds", ["line_adds", "lineadds", "line追加", "友だち", "追加", "adds", "friends"]],
  ["conversions", ["conversions", "conversion", "cv", "コンバージョン"]],
  ["blocks", ["blocks", "block", "ブロック"]],
];

const clean = (v: unknown) => String(v ?? "").trim().replace(/^"|"$/g, "");
const num = (v: unknown) => Math.max(0, Math.round(Number(clean(v).replace(/,/g, "")) || 0));

/** Parse CSV / TSV text into rows. Returns the rows and the header problems found. */
export function parseResultsText(text: string, today = new Date().toISOString().slice(0, 10)): { rows: ResultRow[]; error?: string } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { rows: [], error: "見出し行とデータ行が必要です" };
  const sep = lines[0].includes("\t") ? "\t" : ",";
  const header = lines[0].split(sep).map((h) => clean(h).toLowerCase());
  const idx: Partial<Record<keyof ResultRow, number>> = {};
  for (const [key, names] of COLS) {
    const i = header.findIndex((h) => names.some((n) => h === n || h.includes(n)));
    if (i >= 0 && idx[key] === undefined) idx[key] = i;
  }
  if (idx.creativeId === undefined || idx.impressions === undefined) return { rows: [], error: "ヘッダーに 案ID（creative_id）と 表示（impressions）の列が必要です" };
  const rows: ResultRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(sep);
    const id = clean(cells[idx.creativeId]).replace(/^zc=/, "");
    if (!id) continue;
    const rawDate = idx.date !== undefined ? clean(cells[idx.date]) : "";
    rows.push({
      creativeId: id,
      date: /^\d{4}-\d{2}-\d{2}/.test(rawDate) ? rawDate.slice(0, 10) : /^\d{4}\/\d{1,2}\/\d{1,2}/.test(rawDate) ? rawDate.split("/").map((p, i) => (i === 0 ? p : p.padStart(2, "0"))).join("-").slice(0, 10) : today,
      impressions: num(cells[idx.impressions]),
      clicks: idx.clicks !== undefined ? num(cells[idx.clicks]) : 0,
      lineAdds: idx.lineAdds !== undefined ? num(cells[idx.lineAdds]) : 0,
      conversions: idx.conversions !== undefined ? num(cells[idx.conversions]) : 0,
      blocks: idx.blocks !== undefined ? num(cells[idx.blocks]) : undefined,
    });
  }
  return { rows };
}

/** JSON body of the push API: an array of objects with the same column aliases. */
export function parseResultsJson(body: unknown, today = new Date().toISOString().slice(0, 10)): { rows: ResultRow[]; error?: string } {
  const list = Array.isArray(body) ? body : body && typeof body === "object" && Array.isArray((body as { rows?: unknown }).rows) ? (body as { rows: unknown[] }).rows : null;
  if (!list) return { rows: [], error: "JSON は行の配列（または {rows: [...]}）にしてください" };
  const rows: ResultRow[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const pick = (key: keyof ResultRow) => {
      const names = COLS.find(([k]) => k === key)![1];
      const found = Object.keys(o).find((k) => names.includes(k.toLowerCase()));
      return found !== undefined ? o[found] : undefined;
    };
    const id = clean(pick("creativeId")).replace(/^zc=/, "");
    if (!id) continue;
    const rawDate = clean(pick("date"));
    rows.push({
      creativeId: id,
      date: /^\d{4}-\d{2}-\d{2}/.test(rawDate) ? rawDate.slice(0, 10) : today,
      impressions: num(pick("impressions")),
      clicks: num(pick("clicks")),
      lineAdds: num(pick("lineAdds")),
      conversions: num(pick("conversions")),
      blocks: pick("blocks") !== undefined ? num(pick("blocks")) : undefined,
    });
  }
  return { rows };
}

/** Store rows as snapshots for one brief and refresh each creative's results from its newest snapshot. */
export async function applyResults(briefId: string, rows: ResultRow[], source: ResultSnapshot["source"]) {
  const creatives = await db.creatives.listByBrief(briefId);
  const byId = new Map(creatives.map((c) => [c.id, c]));
  const unknown = new Set<string>();
  const touched = new Set<string>();
  let imported = 0;
  for (const r of rows) {
    const c = byId.get(r.creativeId) ?? creatives.find((x) => r.creativeId.endsWith(x.id));
    if (!c) {
      unknown.add(r.creativeId);
      continue;
    }
    await db.snapshots.put({ id: `sn_${c.id}_${r.date}`, briefId, creativeId: c.id, date: r.date, impressions: r.impressions, clicks: r.clicks, lineAdds: r.lineAdds, conversions: r.conversions, blocks: r.blocks, source, createdAt: nowIso() });
    imported++;
    touched.add(c.id);
  }
  for (const cid of touched) {
    const c = byId.get(cid) as Creative;
    const newest = (await db.snapshots.listByCreative(cid)).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!newest) continue;
    c.results = { impressions: newest.impressions, clicks: newest.clicks, lineAdds: newest.lineAdds, conversions: newest.conversions, blocks: newest.blocks, updatedAt: nowIso() };
    c.updatedAt = nowIso();
    await db.creatives.put(c);
  }
  return { imported, updated: touched.size, unknown: [...unknown] };
}

// Push API token ---------------------------------------------------------------

const secret = () => process.env.REVIEW_SECRET || "dev-review-secret-change-me";

/** Per-brief bearer token for the push API (distinct from the review token). */
export function resultsToken(briefId: string) {
  return createHmac("sha256", secret()).update(`results:${briefId}`).digest("hex").slice(0, 32);
}

export function verifyResultsToken(briefId: string, token: string) {
  const expected = resultsToken(briefId);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
