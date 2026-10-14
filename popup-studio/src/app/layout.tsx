import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getStore } from "@/lib/store";
import { aiAvailable } from "@/lib/ai";

export const metadata: Metadata = {
  title: "Popup Lab",
  description: "勝ちポップアップ発見エンジン。仮説・生成・辛口分析・承認・配信・勝敗判定を一本のループで回す",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const durable = getStore().durable;
  const ai = aiAvailable();
  const weakSecret = process.env.NODE_ENV === "production" && !process.env.REVIEW_SECRET;
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="text-lg font-black tracking-tight">Popup Lab</span>
              <span className="text-xs font-bold text-muted">勝ちポップアップ発見エンジン</span>
            </Link>
            <nav className="flex items-center gap-3 text-sm">
              <Link href="/briefs/new" className="btn-primary">
                新しい実験（ブリーフ）
              </Link>
            </nav>
          </div>
          {(!durable || !ai || weakSecret) && (
            <div className="border-t border-warn/30 bg-warn-soft text-warn">
              <div className="mx-auto max-w-6xl px-4 py-1.5 text-xs font-bold">
                {!durable && <span className="mr-4">データベース未接続: データはインスタンスのメモリに保持され、再起動で消えます（DATABASE_URL を設定してください）。</span>}
                {!ai && <span className="mr-4">生成AI未接続: コピー生成と辛口分析はルールベースで動きます（ANTHROPIC_API_KEY を設定してください）。</span>}
                {weakSecret && <span>承認リンクの署名キーが既定値です（REVIEW_SECRET を設定してください）。</span>}
              </div>
            </div>
          )}
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-line py-4 text-center text-xs text-muted">Popup Lab v0.3 — ZEALS 離脱時ポップアップ検証速度 3x プロジェクト</footer>
      </body>
    </html>
  );
}
