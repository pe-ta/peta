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

const raw = library as { generated_at: string; count: number; industries: Record<string, number>; hooks: Record<string, number>; entries: LibraryEntry[] };

// Names taken from Drive file paths are partly in decomposed form ("テ" + combining "゛"), which
// neither matches "デンタル" nor displays reliably. Normalise every text field once at load.
const nfc = (s: string) => s.normalize("NFC");
const data = {
  ...raw,
  entries: raw.entries.map((e) => ({
    ...e,
    client: nfc(e.client),
    job: nfc(e.job),
    eyebrow: nfc(e.eyebrow),
    headline: nfc(e.headline),
    positive: e.positive && nfc(e.positive),
    negative: e.negative && nfc(e.negative),
    options: e.options && e.options.map(nfc),
    badges: e.badges.map(nfc),
  })),
};

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
 * Specialty groups inside broad industries. "美容・医療" alone puts a dental clinic next to a
 * men's clinic; the specialty decides which past popups are actually comparable.
 */
const SPECIALTIES: Array<[string, RegExp]> = [
  ["dental", /歯科|デンタル|矯正|ホワイトニング|インプラント|歯/],
  ["hair_removal", /脱毛|ムダ毛|vio/i],
  ["hair_loss", /aga|薄毛|育毛|発毛|植毛|アートネイチャー|かつら|ウィッグ/i],
  ["mens_health", /メンズ|男性|包茎|ed\b|ed治療|性病|泌尿/i],
  ["cosmetic_surgery", /美容外科|整形|二重|豊胸|脂肪吸引|リフト/],
  ["skin", /肌|シミ|ニキビ|毛穴|美容皮膚|スキンケア|化粧水|美容液/],
  ["diet", /ダイエット|痩|体重|ジム|パーソナル|ピラティス|ヨガ/],
  ["women_health", /ピル|婦人|妊活|更年期/],
  ["card_bank", /カード|銀行|口座|ローン|融資|借入/],
  ["insurance", /保険|共済|生命/],
  ["invest", /投資|証券|nisa|fx|資産運用/i],
  ["school_kids", /塾|小学|中学|高校|受験|お子/],
  ["language", /英会話|英語|語学/],
  ["license", /資格|講座|会計士|簿記|試験/],
];

function specialtiesOf(text: string) {
  return new Set(SPECIALTIES.filter(([, re]) => re.test(text)).map(([k]) => k));
}

/** OCR fragments that read as noise: long Latin runs, or mostly non-Japanese characters. */
export function looksGarbled(s: string) {
  if (!s) return false;
  if (/[A-Za-z]{12,}/.test(s)) return true;
  const jp = (s.match(/[一-龠ぁ-んァ-ヶー]/g) ?? []).length;
  return s.length >= 6 && jp / s.length < 0.4;
}

/**
 * Past cases close to a brief: same specialty first, then industry, hook and shared words.
 * Entries with a usable button pair rank higher because they show the whole structure.
 */
export function findSimilar(brief: Pick<Brief, "industry" | "clientName" | "offer" | "target"> & Partial<Pick<Brief, "lpTitle" | "lpDescription" | "exitContext">>, hook?: AppealAxis, limit = 8): LibraryEntry[] {
  const inds = INDUSTRY_ALIASES[brief.industry] ?? [brief.industry];
  const wanted = hook ? normalizeAppeal(hook) : undefined;
  const briefText = `${brief.clientName} ${brief.offer} ${brief.target} ${brief.lpTitle ?? ""} ${brief.lpDescription ?? ""}`;
  const words = new Set(tokens(briefText));
  const mine = specialtiesOf(briefText);
  const scored = data.entries
    .filter((e) => !looksGarbled(e.headline))
    .map((e) => {
      let score = 0;
      if (inds[0] && e.industry === inds[0]) score += 6;
      else if (inds.includes(e.industry)) score += 3;
      const theirs = specialtiesOf(`${e.client} ${e.headline} ${e.eyebrow}`);
      if (mine.size && theirs.size) {
        const shared = [...theirs].some((k) => mine.has(k));
        // Another specialty (a dental clinic for a men's clinic) is not a comparable case at all.
        if (!shared) score -= 100;
        else score += 8;
      }
      if (wanted && e.hook !== "other" && normalizeAppeal(e.hook) === wanted) score += 4;
      if (e.structure === "two_buttons" || e.structure === "multi_choice") score += 2;
      if (e.eyebrow && !looksGarbled(e.eyebrow)) score += 1;
      for (const t of tokens(e.headline + " " + e.client)) if (words.has(t)) score += 2;
      // Leading "_" / "-" in client names come from file naming, not the brand.
      return { e: { ...e, client: e.client.replace(/^[_\-\s]+/, ""), eyebrow: looksGarbled(e.eyebrow) ? "" : e.eyebrow }, score };
    });
  // One entry per client so a single advertiser's variants do not fill the list.
  const seen = new Set<string>();
  return scored
    .filter((s) => s.score > 2)
    .sort((a, b) => b.score - a.score || a.e.client.localeCompare(b.e.client))
    .filter((s) => {
      const k = s.e.client.replace(/[\s　\-_・／/]/g, "");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, limit)
    .map((s) => s.e);
}

/** Compact one-line rendering for prompts and lists. */
export function describeEntry(e: LibraryEntry) {
  const buttons = e.options?.length ? `選択肢: ${e.options.join("／")}` : `${e.negative ?? "（なし）"}／${e.positive ?? "（不明）"}`;
  return `帯「${e.eyebrow || "—"}」 見出し「${e.headline}」 ボタン ${buttons}${e.badges.length ? ` バッジ「${e.badges[0]}」` : ""}`;
}
