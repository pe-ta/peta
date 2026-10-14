// Domain types for Popup Studio (MVP).
// Kept deliberately flat: every entity is a JSON document keyed by id.

export type AppealAxis =
  | "price" // 価格・割引
  | "scarcity" // 限定・期限
  | "anxiety" // 不安解消・保証
  | "diagnosis" // 診断・セルフチェック
  | "social" // 社会的証明・実績
  | "benefit"; // 特典・プレゼント

export type VisualAxis = "image" | "text" | "coupon";

export const VISUAL_AXES: { id: VisualAxis; label: string; hint: string }[] = [
  { id: "text", label: "テキスト主体型", hint: "ブランド色の面に大きな見出し。数字が主役" },
  { id: "image", label: "画像主体型", hint: "LPのOG画像や商品写真を上半分に。画像が無ければ装飾" },
  { id: "coupon", label: "クーポン型", hint: "チケット風。割引・特典の受け取りを直感的に" },
];
export type Motion = "static" | "pop" | "slide" | "pulse";

export const APPEAL_AXES: { id: AppealAxis; label: string; hint: string }[] = [
  { id: "price", label: "価格・割引", hint: "◯%OFF、初回◯円" },
  { id: "scarcity", label: "限定・期限", hint: "今だけ、◯名限定、本日まで" },
  { id: "anxiety", label: "不安解消", hint: "返金保証、無料相談、匿名OK" },
  { id: "diagnosis", label: "診断・セルフチェック", hint: "30秒で分かる、3問で判定" },
  { id: "social", label: "社会的証明", hint: "累計◯万人、満足度◯%" },
  { id: "benefit", label: "特典", hint: "LINE限定クーポン、無料サンプル" },
];

export const MOTIONS: { id: Motion; label: string }[] = [
  { id: "static", label: "静止（PNG）" },
  { id: "pop", label: "ポップイン（GIF）" },
  { id: "slide", label: "スライドイン（GIF）" },
  { id: "pulse", label: "CTA点滅（GIF）" },
];

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
  { id: "ctr", label: "クリック率", numerator: "clicks", hint: "表示あたりのクリック。早く結論が出るが、追加後の離脱を見逃す" },
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

export interface CreativeSlots {
  eyebrow: string; // 小見出し (例: LINE限定)
  headline: string;
  sub: string;
  cta: string;
  badge?: string; // 例: 55%OFF
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
    clarity: number; // 訴求の明確さ: 何が得か1秒で分かるか
    fit: number; // 離脱文脈との適合: 離脱直前の心理に答えているか
    cta: number; // CTA: 次の行動が具体的で低負荷か
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
  hypothesis: string;
  rationale?: string;
  slots: CreativeSlots;
  status: CreativeStatus;
  version: number;
  critique?: Critique;
  results?: CreativeResults;
  experiment?: ExperimentState;
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
