import type { CreativeSlots } from "./types";

/**
 * Structural rules shared by preflight (sync, editor) and the rule-based critic,
 * so the two never disagree about the same creative.
 */

/** Headline reads as a question / call to the reader. */
export const QUESTION_RE = /[？?]$|ませんか|したい[！!]?$|気になる|知りたい|でしょうか|どっち|どれ/;
/** Negative-button wording that shames the reader. */
export const GUILT_RE = /損|いらない|興味ない|結構です|必要ない/;
/** Low action cost is shown somewhere: LINE / 無料 / 30秒 / 3問 / かんたん. */
export const LOW_COST_RE = /LINE|ライン|無料|\d+\s*秒|\d+\s*分|\d+\s*問|かんたん|簡単|カンタン/i;

export function isQuestion(headline: string) {
  return QUESTION_RE.test(headline.trim());
}

export function mentionsLowCost(s: Pick<CreativeSlots, "eyebrow" | "badge" | "sub">) {
  return LOW_COST_RE.test(`${s.eyebrow} ${s.badge ?? ""} ${s.sub}`);
}

export function guiltyNegative(s: Pick<CreativeSlots, "negative">) {
  return !!s.negative && GUILT_RE.test(s.negative);
}
