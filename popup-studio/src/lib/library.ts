import library from "../../data/library.json";
import { normalizeAppeal, type AppealAxis, type Brief } from "./types";

/**
 * Reference library of past ZEALS popups (text metadata only, extracted by OCR
 * from the 1,066-file inventory; see tools/inventory/library.py). Used for
 * "past similar cases" on the brief page and as few-shot examples when
 * generating copy. OCR text may contain recognition errors.
 */

export interface LibraryEntry {
  id: string;
  client: string;
  job: string;
  industry: string;
  hook: string;
  structure: "two_buttons" | "single_cta" | "multi_choice" | "no_button_detected";
  eyebrow: string;
  headline: string;
  positive: string | null;
  negative: string | null;
  options: string[] | null;
  badges: string[];
  spec: string;
  animated: boolean;
  cluster: string | null;
  tags: string[];
}

const data = library as { generated_at: string; count: number; industries: Record<string, number>; hooks: Record<string, number>; entries: LibraryEntry[] };

export const LIBRARY_META = { generatedAt: data.generated_at, count: data.count, industries: data.industries, hooks: data.hooks };

// Brief industry (form options) -> library industries (library.py), closest first.
const INDUSTRY_ALIASES: Record<string, string[]> = {
  "美容・医療": ["美容・医療", "フィットネス・美容サロン", "化粧品"],
  "健康食品・サプリ": ["健康食品・サプリ", "化粧品"],
  化粧品: ["化粧品", "美容・医療"],
  "金融・保険": ["金融・保険"],
  不動産: ["不動産", "金融・保険", "インフラ・生活"],
  "教育・スクール": ["教育・スクール", "人材"],
  人材: ["人材", "教育・スクール"],
  "EC・通販": ["EC・通販", "化粧品", "健康食品・サプリ", "インフラ・生活"],
  その他: [],
};

function tokens(s: string) {
  return (s.match(/[一-龠ぁ-んァ-ヶA-Za-z0-9]{2,}/g) ?? []).map((t) => t.toLowerCase());
}

/**
 * Past cases close to a brief: same industry first, then same hook, then
 * shared words between the brief and the headline. Entries with a usable
 * button pair rank higher because they show the whole structure.
 */
export function findSimilar(brief: Pick<Brief, "industry" | "clientName" | "offer" | "target">, hook?: AppealAxis, limit = 8): LibraryEntry[] {
  const inds = INDUSTRY_ALIASES[brief.industry] ?? [brief.industry];
  const wanted = hook ? normalizeAppeal(hook) : undefined;
  const words = new Set(tokens(`${brief.clientName} ${brief.offer} ${brief.target}`));
  const scored = data.entries.map((e) => {
    let score = 0;
    if (inds[0] && e.industry === inds[0]) score += 6;
    else if (inds.includes(e.industry)) score += 3;
    if (wanted && e.hook !== "other" && normalizeAppeal(e.hook) === wanted) score += 4;
    if (e.structure === "two_buttons" || e.structure === "multi_choice") score += 2;
    if (e.eyebrow) score += 1;
    for (const t of tokens(e.headline + " " + e.client)) if (words.has(t)) score += 2;
    return { e, score };
  });
  return scored
    .filter((s) => s.score > 2)
    .sort((a, b) => b.score - a.score || a.e.client.localeCompare(b.e.client))
    .slice(0, limit)
    .map((s) => s.e);
}

/** Compact one-line rendering for prompts and lists. */
export function describeEntry(e: LibraryEntry) {
  const buttons = e.options?.length ? `選択肢: ${e.options.join("／")}` : `${e.negative ?? "（なし）"}／${e.positive ?? "（不明）"}`;
  return `帯「${e.eyebrow || "—"}」 見出し「${e.headline}」 ボタン ${buttons}${e.badges.length ? ` バッジ「${e.badges[0]}」` : ""}`;
}
