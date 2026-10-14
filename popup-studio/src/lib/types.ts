// Domain types for Popup Studio (MVP).
// Kept deliberately flat: every entity is a JSON document keyed by id.

export type AppealAxis =
  | "price" // 価格・割引
  | "scarcity" // 限定・期限
  | "anxiety" // 不安解消・保証
  | "diagnosis" // 診断・セルフチェック
  | "social" // 社会的証明・実績
  | "benefit"; // 特典・プレゼント

export type VisualAxis = "image" | "text";
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

export interface Brief {
  id: string;
  createdAt: string;
  updatedAt: string;
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
