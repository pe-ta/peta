// Domain types for Popup Lab.
// Kept deliberately flat: every entity is a JSON document keyed by id.
//
// v0.4: the taxonomy follows the inventory of 1,066 past ZEALS popups
// (docs/07_popup_inventory.md): a 900x1265 canvas, a five-band structure
// (ribbon / question headline / visual / badge / two buttons) and seven hooks.

/** フック（切り口）。過去資産の分類 7 系統。 */
export type AppealAxis =
  | "compatibility" // 相性診断: 「◯◯との相性をチェックしませんか？」
  | "invitation" // 招待状: 「◯◯から招待状が届きました」
  | "pain" // 悩み共感: 「脱毛したのに、また毛が生えてきた…」
  | "campaign" // キャンペーン特典: 「現金プレゼントキャンペーン実施中」
  | "quiz" // クイズ: 「最大何%OFFで受けられるでしょうか？」
  | "type_choice" // 二択タイプ診断: 「お子様はどっち？ 体験型／積み上げ型」
  | "price"; // 価格知りたい: 「結局いくらかかるの？」

export const APPEAL_AXES: { id: AppealAxis; label: string; hint: string; be: string[] }[] = [
  { id: "compatibility", label: "相性診断", hint: "「◯◯との相性をチェックしませんか？」自分事化。塾・保険・スクールで最多", be: ["自己関連性", "好奇心"] },
  { id: "invitation", label: "招待状", hint: "「◯◯から招待状が届きました」特別扱い。銀行・証券・不動産", be: ["返報性", "特別感"] },
  { id: "pain", label: "悩み共感", hint: "「〜したのに、また…」離脱理由の言語化。美容医療・金融", be: ["問題の顕在化", "共感"] },
  { id: "campaign", label: "キャンペーン特典", hint: "「現金プレゼント実施中」「0円体験」数字が主役", be: ["ゲイン・フレーミング", "損失回避"] },
  { id: "quiz", label: "クイズ", hint: "「最大何%OFFでしょうか？」答えを LINE で", be: ["好奇心ギャップ"] },
  { id: "type_choice", label: "二択タイプ診断", hint: "「あなたはどっち？ A／B」ボタン自体が選択肢", be: ["自己診断", "コミットメント"] },
  { id: "price", label: "価格知りたい", hint: "「結局いくらかかるの？」料金ページ離脱に", be: ["アンカリング", "不確実性の低減"] },
];

/** 旧 ID（v0.3 以前の保存データ）を新フックに読み替える。 */
export const LEGACY_APPEAL: Record<string, AppealAxis> = {
  diagnosis: "compatibility",
  social: "compatibility",
  anxiety: "pain",
  scarcity: "campaign",
  benefit: "campaign",
};
export function normalizeAppeal(id: string): AppealAxis {
  return (APPEAL_AXES.some((a) => a.id === id) ? id : LEGACY_APPEAL[id] ?? "compatibility") as AppealAxis;
}
export function appealLabel(id: string) {
  return APPEAL_AXES.find((a) => a.id === normalizeAppeal(id))?.label ?? id;
}

/** ビジュアル（中段）の様式。 */
export type VisualAxis = "art" | "photo";

export const VISUAL_AXES: { id: VisualAxis; label: string; hint: string }[] = [
  { id: "art", label: "ブランド色の装飾", hint: "写真が無くても成立。吹き出し・図形で質問を強調" },
  { id: "photo", label: "写真", hint: "LP の OG 画像や商品・人物写真を丸窓に。実績では人物写真が約3分の1" },
];
export const LEGACY_VISUAL: Record<string, VisualAxis> = { text: "art", image: "photo", coupon: "art" };
export function normalizeVisual(id: string): VisualAxis {
  return (VISUAL_AXES.some((v) => v.id === id) ? id : LEGACY_VISUAL[id] ?? "art") as VisualAxis;
}

/** 動き。実績の GIF は「点滅」「指カーソル」「装飾」の 3 型。 */
export type Motion = "static" | "blink" | "cursor" | "pop";

export const MOTIONS: { id: Motion; label: string; hint: string }[] = [
  { id: "static", label: "静止（PNG）", hint: "まず静止で比較するのが速い" },
  { id: "blink", label: "点滅（GIF）", hint: "肯定ボタンと帯を交互に光らせる。実績 GIF の 4 割がこの 2 フレーム型" },
  { id: "cursor", label: "指カーソル（GIF）", hint: "指が肯定ボタンをタップする。行動の予告" },
  { id: "pop", label: "ポップイン（GIF）", hint: "表示時に拡大しながら現れる" },
];
export const LEGACY_MOTION: Record<string, Motion> = { pulse: "blink", slide: "pop" };
export function normalizeMotion(id: string): Motion {
  return (MOTIONS.some((m) => m.id === id) ? id : LEGACY_MOTION[id] ?? "static") as Motion;
}

/** レイアウト（テンプレート）。実績構造の 4 型。 */
export type LayoutId = "question" | "invitation" | "campaign" | "choice" | "photo-full" | "bubble" | "tiles";

export interface BrandKit {
  primary: string; // hex
  accent: string; // hex
  background: string; // hex
  text: string; // hex
  logoText: string; // ロゴ画像が無い場合のテキストロゴ
  ngWords: string[];
  tone: string; // 例: 丁寧・親しみ・医療らしい信頼感
}

/** What "winning" means for this client. Aligned with the success-fee basis. */
export type WinMetric = "ctr" | "line_add_rate" | "cvr";

export const WIN_METRICS: { id: WinMetric; label: string; numerator: string; hint: string }[] = [
  { id: "line_add_rate", label: "LINE友だち追加率", numerator: "lineAdds", hint: "表示あたりの友だち追加。成果報酬の母数に最も近い" },
  { id: "ctr", label: "タップ率", numerator: "clicks", hint: "表示あたりの肯定ボタンのタップ。早く結論が出るが、追加後の離脱を見逃す" },
  { id: "cvr", label: "CV率", numerator: "conversions", hint: "表示あたりの最終CV。最も正しいが結論まで時間がかかる" },
];

export interface Brief {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** Metric used to judge challengers against the champion. */
  winMetric: WinMetric;
  /** Creative id currently serving as the champion (control). */
  championId?: string;
  clientName: string;
  industry: string;
  lpUrl: string;
  lpTitle?: string;
  lpDescription?: string;
  lpOgImage?: string;
  offer: string; // オファー: 55%OFF LINE限定クーポン など
  target: string; // ターゲット
  exitContext: string; // 離脱文脈: 料金ページで戻る操作 など
  deviceSize: "sp" | "pc";
  brand: BrandKit;
  appealAxes: AppealAxis[];
  visualAxes: VisualAxis[];
  motions: Motion[];
  notes?: string;
  copySource: "ai" | "fallback";
}

/** 5 段構造のスロット。帯 / 質問見出し / ビジュアル / 小バッジ / ボタン対。 */
export interface CreativeSlots {
  eyebrow: string; // 帯（リボン）: 「LINEで無料診断！」「招待状が届きました」
  headline: string; // 質問見出し: 「◯◯との相性をチェックしませんか？」
  sub: string; // 補足（小）: 「あなたに合ったプランをチェック」
  cta: string; // 肯定ボタン: 「はい」「診断する」「知りたい」
  negative?: string; // 否定ボタン: 「いいえ」「また今度」。空なら CTA 1 本
  badge?: string; // 小バッジ: 「LINEで簡単30秒」「無料」「3問」
  options?: string[]; // 多択レイアウトの選択肢（2〜3）
  imageUrl?: string;
  // colors can override brand kit per creative
  primary?: string;
  accent?: string;
  background?: string;
  text?: string;
}

export type CreativeStatus =
  | "draft"
  | "reviewing"
  | "submitted"
  | "approved"
  | "rejected"
  | "live"
  | "ended";

/** Observed results for a creative while it is live. Entered manually until the delivery platform exports them. */
export interface CreativeResults {
  impressions: number;
  clicks: number;
  lineAdds: number;
  conversions: number;
  blocks?: number;
  updatedAt: string;
}

export interface ExperimentState {
  startedAt: string;
  endedAt?: string;
  outcome?: "won" | "lost" | "inconclusive";
}

/** Blunt, structured critique in the style of the short-video analyzer: score + verdict + fixes. */
export interface Critique {
  createdAt: string;
  source: "ai" | "rules";
  overall: number; // 0-100
  verdict: string; // 一言の辛口総評
  scores: {
    attention: number; // 注目: 0.5秒で目に入るか
    clarity: number; // 質問の明確さ: 何を聞かれているか1秒で分かるか
    fit: number; // 離脱文脈との適合: 離脱直前の心理に答えているか
    cta: number; // ボタン対: 肯定が押しやすく、否定が自然な逃げ道か
    trust: number; // 信頼・ブランド整合
    risk: number; // 表現リスクの低さ（高いほど安全）
  };
  problems: string[]; // 容赦ない指摘（原因まで）
  fixes: string[]; // 具体的な直し方（文言レベル）
  vsChampion?: {
    championId: string;
    challengerWins: boolean;
    confidence: number; // 0-1
    reason: string;
    /** チャンピオンとの差分（何が違うか）。比較推論の根拠。 */
    diff?: string;
  };
}

export interface Creative {
  id: string;
  briefId: string;
  createdAt: string;
  updatedAt: string;
  templateId: string;
  appealAxis: AppealAxis;
  visualAxis: VisualAxis;
  motion: Motion;
  /** Backlog entry this creative tests (v0.5). Older creatives carry only the text. */
  hypothesisId?: string;
  hypothesis: string;
  rationale?: string;
  slots: CreativeSlots;
  status: CreativeStatus;
  version: number;
  critique?: Critique;
  results?: CreativeResults;
  experiment?: ExperimentState;
}

/**
 * 仮説バックログ。実験の単位は「仮説」で、案（Creative）はその具体化。
 * 1 案件で比較する仮説の数を増やし、結論を出して次へ進む回転が North Star。
 */
export type HypothesisStatus = "backlog" | "drafting" | "testing" | "concluded" | "dropped";
export type HypothesisSource = "ap" | "learning" | "client" | "library";

export interface Hypothesis {
  id: string;
  briefId: string;
  createdAt: string;
  updatedAt: string;
  title: string; // 「招待状型は様子見層のタップ率を上げる」
  rationale?: string; // なぜそう思うか・出典
  hook: AppealAxis; // 具体化するときのフック
  source: HypothesisSource;
  priority: 1 | 2 | 3; // 1 = 次に試す
  status: HypothesisStatus;
  creativeIds: string[];
  outcome?: "won" | "lost" | "inconclusive";
  learningId?: string;
  author: string;
}

export const HYPOTHESIS_STATUS: { id: HypothesisStatus; label: string }[] = [
  { id: "backlog", label: "未着手" },
  { id: "drafting", label: "案を作成中" },
  { id: "testing", label: "検証中" },
  { id: "concluded", label: "結論済み" },
  { id: "dropped", label: "見送り" },
];

export const HYPOTHESIS_SOURCES: { id: HypothesisSource; label: string }[] = [
  { id: "ap", label: "AP の着想" },
  { id: "learning", label: "学びログから" },
  { id: "client", label: "クライアント要望" },
  { id: "library", label: "過去の勝ち型" },
];

/** 配信結果の日次スナップショット（累計値）。配信基盤の CSV から取り込む。 */
export interface ResultSnapshot {
  id: string;
  briefId: string;
  creativeId: string;
  date: string; // YYYY-MM-DD
  impressions: number;
  clicks: number;
  lineAdds: number;
  conversions: number;
  blocks?: number;
  source: "manual" | "csv";
  createdAt: string;
}

/** DNA タグ: 学習ログで集計する軸。案から機械的に導く。 */
export interface Dna {
  hook: AppealAxis;
  structure: "two_buttons" | "single_cta" | "multi_choice";
  visual: VisualAxis;
  motion: Motion;
  layout: string;
  /** 行動経済学タグ（フック由来 + 文言由来）。 */
  tags: string[];
}

/** Learning log: what we tried, what happened, what we try next. */
export interface Learning {
  id: string;
  briefId: string;
  creativeId?: string;
  createdAt: string;
  hypothesis: string;
  outcome: "won" | "lost" | "inconclusive" | "note";
  evidence?: string; // 例: 友だち追加率 3.1% vs 2.4%（P=0.97）
  nextHypothesis?: string;
  author: string;
  /** 勝敗が出た案の DNA。タグ別の勝率集計に使う。 */
  dna?: Dna;
}

export type RejectReason =
  | "brand"
  | "legal"
  | "direction"
  | "preference"
  | "typo"
  | "other";

export const REJECT_REASONS: { id: RejectReason; label: string }[] = [
  { id: "brand", label: "ブランド規約" },
  { id: "legal", label: "法務・表現規制" },
  { id: "direction", label: "訴求の方向性" },
  { id: "preference", label: "好み・トーン" },
  { id: "typo", label: "誤字・表記" },
  { id: "other", label: "その他" },
];

export interface Review {
  id: string;
  briefId: string;
  creativeId: string;
  createdAt: string;
  reviewer: string; // 表示名（クライアント側入力）
  decision: "approved" | "rejected" | "comment";
  reasons: RejectReason[];
  comment: string;
  source: "internal" | "client";
}

export interface PreflightIssue {
  code: string;
  severity: "error" | "warn" | "info";
  message: string;
  suggestion?: string;
}

export interface PreflightResult {
  score: number; // 0-100
  issues: PreflightIssue[];
  metrics: {
    contrastHeadline: number;
    contrastCta: number;
    minFontPx: number;
    headlineChars: number;
    bytes?: number;
  };
}
