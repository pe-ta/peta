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

/** Column aliases, exact (case-insensitive) first, then prefix. The bare "id" only matches exactly. */
const COLS: Array<[keyof ResultRow, string[]]> = [
  ["creativeId", ["creative_id", "creativeid", "creative", "zc", "案id", "案 id", "クリエイティブid", "id"]],
  ["date", ["date", "日付", "day", "report_date"]],
  ["impressions", ["impressions", "impression", "imps", "imp", "表示", "表示回数", "インプレッション"]],
  ["clicks", ["clicks", "click", "taps", "tap", "タップ", "タップ数", "クリック", "クリック数"]],
  ["lineAdds", ["line_adds", "lineadds", "line追加", "line追加数", "友だち追加", "友だち追加数", "adds", "friends"]],
  ["conversions", ["conversions", "conversion", "cv", "cv数", "コンバージョン"]],
  ["blocks", ["blocks", "block", "ブロック", "ブロック数"]],
];

const clean = (v: unknown) => String(v ?? "").trim().replace(/^"|"$/g, "").trim();
const num = (v: unknown) => Math.max(0, Math.round(Number(clean(v).replace(/[,，]/g, "")) || 0));

/** Today's calendar date in Japan, where the users and the delivery platform live. */
export function todayJst() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Accepts 2026-10-15, 2026/10/5, 2026-10-15T03:00:00Z, 20261015; else null. */
export function normalizeDate(raw: unknown): string | null {
  const s = clean(raw);
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (!m) m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** RFC 4180-ish line splitter: quoted fields may contain the separator and doubled quotes. */
export function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function columnIndex(header: string[], names: string[]) {
  for (const n of names) {
    const i = header.findIndex((h) => h === n);
    if (i >= 0) return i;
  }
  for (const n of names) {
    if (n === "id") continue; // too short to prefix-match safely
    const i = header.findIndex((h) => h.startsWith(n));
    if (i >= 0) return i;
  }
  return -1;
}

/** Parse CSV / TSV text into rows. */
export function parseResultsText(text: string, today = todayJst()): { rows: ResultRow[]; error?: string } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { rows: [], error: "見出し行とデータ行が必要です" };
  const sep = lines[0].includes("\t") ? "\t" : ",";
  const header = splitLine(lines[0], sep).map((h) => clean(h).toLowerCase());
  const idx: Partial<Record<keyof ResultRow, number>> = {};
  for (const [key, names] of COLS) {
    const i = columnIndex(header, names);
    if (i >= 0) idx[key] = i;
  }
  if (idx.creativeId === undefined || idx.impressions === undefined) return { rows: [], error: "ヘッダーに 案ID（creative_id）と 表示（impressions）の列が必要です" };
  const rows: ResultRow[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitLine(line, sep);
    const id = clean(cells[idx.creativeId]).replace(/^zc=/, "");
    if (!id) continue;
    rows.push({
      creativeId: id,
      date: (idx.date !== undefined && normalizeDate(cells[idx.date])) || today,
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
export function parseResultsJson(body: unknown, today = todayJst()): { rows: ResultRow[]; error?: string } {
  const list = Array.isArray(body) ? body : body && typeof body === "object" && Array.isArray((body as { rows?: unknown }).rows) ? (body as { rows: unknown[] }).rows : null;
  if (!list) return { rows: [], error: "JSON は行の配列（または {rows: [...]}）にしてください" };
  const rows: ResultRow[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const keys = Object.keys(o).map((k) => k.toLowerCase());
    const pick = (key: keyof ResultRow) => {
      const names = COLS.find(([k]) => k === key)![1];
      const i = columnIndex(keys, names);
      return i >= 0 ? o[Object.keys(o)[i]] : undefined;
    };
    const id = clean(pick("creativeId")).replace(/^zc=/, "");
    if (!id) continue;
    rows.push({
      creativeId: id,
      date: normalizeDate(pick("date")) ?? today,
      impressions: num(pick("impressions")),
      clicks: num(pick("clicks")),
      lineAdds: num(pick("lineAdds")),
      conversions: num(pick("conversions")),
      blocks: pick("blocks") !== undefined ? num(pick("blocks")) : undefined,
    });
  }
  return { rows };
}

/** Rows whose counts cannot be right (more clicks than impressions, etc.). */
export function invalidReason(r: ResultRow) {
  if (r.clicks > r.impressions || r.lineAdds > r.impressions || r.conversions > r.impressions) return "タップ・LINE追加・CV が表示回数を超えています";
  return null;
}

/** Store rows as snapshots for one brief and refresh each creative's results from its newest snapshot. */
export async function applyResults(briefId: string, rows: ResultRow[], source: ResultSnapshot["source"]) {
  const creatives = await db.creatives.listByBrief(briefId);
  const byId = new Map(creatives.map((c) => [c.id, c]));
  const unknown = new Set<string>();
  const invalid: string[] = [];
  const touched = new Set<string>();
  let imported = 0;
  // One read of this brief's history; the newest row per creative is tracked in memory.
  const newest = new Map<string, ResultSnapshot>();
  for (const s of await db.snapshots.listByBrief(briefId)) {
    const prev = newest.get(s.creativeId);
    if (!prev || prev.date < s.date) newest.set(s.creativeId, s);
  }
  for (const r of rows) {
    const c = byId.get(r.creativeId) ?? creatives.find((x) => r.creativeId.endsWith(x.id));
    if (!c) {
      unknown.add(r.creativeId);
      continue;
    }
    const bad = invalidReason(r);
    if (bad) {
      invalid.push(`${r.creativeId} ${r.date}: ${bad}`);
      continue;
    }
    const snap: ResultSnapshot = { id: `sn_${c.id}_${r.date}`, briefId, creativeId: c.id, date: r.date, impressions: r.impressions, clicks: r.clicks, lineAdds: r.lineAdds, conversions: r.conversions, blocks: r.blocks, source, createdAt: nowIso() };
    await db.snapshots.put(snap);
    imported++;
    touched.add(c.id);
    const prev = newest.get(c.id);
    if (!prev || prev.date <= snap.date) newest.set(c.id, snap);
  }
  for (const cid of touched) {
    const c = byId.get(cid) as Creative;
    const n = newest.get(cid);
    if (!n) continue;
    c.results = { impressions: n.impressions, clicks: n.clicks, lineAdds: n.lineAdds, conversions: n.conversions, blocks: n.blocks, updatedAt: nowIso() };
    c.updatedAt = nowIso();
    await db.creatives.put(c);
  }
  return { imported, updated: touched.size, unknown: [...unknown], invalid };
}

// Push API token ---------------------------------------------------------------

const DEFAULT_SECRET = "dev-review-secret-change-me";
const secret = () => process.env.REVIEW_SECRET || DEFAULT_SECRET;

/** True when the deployment has no real secret: the push API refuses to accept writes then. */
export function secretIsDefault() {
  return secret() === DEFAULT_SECRET;
}

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
