import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getStore } from "@/lib/store";
import { aiAvailable } from "@/lib/ai";

export const metadata: Metadata = {
  title: "Popup Studio",
  description: "離脱時ポップアップの仮説・生成・承認を一本のループで回す",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const durable = getStore().durable;
  const ai = aiAvailable();
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="text-lg font-black tracking-tight">Popup Studio</span>
              <span className="text-xs font-bold text-muted">MVP</span>
            </Link>
            <nav className="flex items-center gap-3 text-sm">
              <Link href="/briefs/new" className="btn-primary">
                新しいブリーフ
              </Link>
            </nav>
          </div>
          {(!durable || !ai) && (
            <div className="border-t border-warn/30 bg-warn-soft text-warn">
              <div className="mx-auto max-w-6xl px-4 py-1.5 text-xs font-bold">
                {!durable && <span className="mr-4">データベース未接続: データはインスタンスのメモリに保持され、再起動で消えます（DATABASE_URL を設定してください）。</span>}
                {!ai && <span>生成AI未接続: コピーはルールベースで生成されます（ANTHROPIC_API_KEY を設定してください）。</span>}
              </div>
            </div>
          )}
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-line py-4 text-center text-xs text-muted">Popup Studio v0.1 — ZEALS 離脱時ポップアップ検証速度 3x プロジェクト</footer>
      </body>
    </html>
  );
}
