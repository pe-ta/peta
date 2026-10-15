"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Internal header (nav + configuration warnings). Hidden on the client review portal,
 * which is opened by people outside ZEALS and must not show internal navigation or setup notes.
 */
export function AppChrome({ providerName, warnings }: { providerName: string | null; warnings: string[] }) {
  const path = usePathname();
  if (path?.startsWith("/review/")) {
    return (
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center px-4 py-3">
          <span className="text-base font-black tracking-tight">ポップアップ案のご確認</span>
        </div>
      </header>
    );
  }
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 text-lg font-black tracking-tight">Popup Lab</span>
          <span className="hidden truncate text-xs font-bold text-muted sm:inline">勝ちポップアップ発見エンジン{providerName ? ` · AI: ${providerName}` : ""}</span>
        </Link>
        <nav className="flex shrink-0 items-center gap-3 text-sm">
          <Link href="/" className="whitespace-nowrap text-xs font-bold text-muted hover:text-ink">
            <span className="sm:hidden">ボード</span>
            <span className="hidden sm:inline">実験ボード</span>
          </Link>
          <Link href="/learnings" className="whitespace-nowrap text-xs font-bold text-muted hover:text-ink">学び</Link>
          <Link href="/templates" className="whitespace-nowrap text-xs font-bold text-muted hover:text-ink">型</Link>
          <Link href="/briefs/new" className="btn-primary whitespace-nowrap">
            <span className="sm:hidden">新規</span>
            <span className="hidden sm:inline">新しい実験（ブリーフ）</span>
          </Link>
        </nav>
      </div>
      {warnings.length > 0 && (
        <div className="border-t border-warn/30 bg-warn-soft text-warn">
          <div className="mx-auto flex max-w-6xl flex-col gap-0.5 px-4 py-1.5 text-xs font-bold sm:block">
            {warnings.map((w) => (
              <span key={w} className="sm:mr-4">{w}</span>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}

/** Footer is internal too. */
export function AppFooter() {
  const path = usePathname();
  if (path?.startsWith("/review/")) return null;
  return <footer className="border-t border-line py-4 text-center text-xs text-muted">Popup Lab v0.5 — ZEALS 離脱時ポップアップ検証速度 3x プロジェクト</footer>;
}
