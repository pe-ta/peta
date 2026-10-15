/**
 * Copy corpus distilled from the inventory of past ZEALS popups
 * (docs/07_popup_inventory.md). Ordered by observed frequency. Updated from
 * tools/inventory/corpus.py output; keep the lists short, they are prompt text.
 */

/** 帯（上部リボン）の定型。 */
export const EYEBROWS: string[] = [
  "LINEで無料診断！",
  "招待状が届きました",
  "これが表示された方は",
  "◯◯を迷っているなら",
  "かんたん診断",
  "おトクなキャンペーンは",
  "あなたに合った◯◯を",
  "LINEでかんたん30秒",
  "そんなあなたへ",
  "ちょっと待って！",
];

/** ボタン対（否定, 肯定）。 */
// OCR counts over 1,068 past popups: いいえ/はい 503, また今度/気になる 35, また今度/診断する 30,
// また今度/チェック 27, また今度/知りたい 14. Single labels: はい 560, いいえ 536, また今度 125.
export const BUTTON_PAIRS: Array<[string, string]> = [
  ["いいえ", "はい"],
  ["また今度", "気になる"],
  ["また今度", "診断する"],
  ["また今度", "チェックする"],
  ["また今度", "知りたい"],
  ["気になる", "やってみる"],
  ["いいえ", "診断する"],
  ["また今度", "見つけたい"],
  ["いいえ", "知りたい"],
  ["また今度", "はい"],
];

/** 小バッジ。 */
export const BADGES: string[] = ["LINEで簡単30秒", "無料", "LINEで無料チェック", "かんたん30秒", "3問で診断", "LINEで無料診断", "簡単1分"];

/** 見出しの型（◯◯ はクライアント名・サービス名）。 */
export const HEADLINE_PATTERNS: string[] = [
  "◯◯との相性をチェックしませんか？",
  "あなたに合った◯◯を診断しませんか？",
  "自分にぴったりの◯◯が知りたい！",
  "◯◯が合っているかチェックしてみませんか？",
  "〜したのに、また…と感じていませんか？",
  "結局、◯◯っていくらかかるの？",
  "◯◯、本当に安くなるのかをチェック！",
  "お子様はどっち？",
];
