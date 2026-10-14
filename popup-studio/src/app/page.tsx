import Link from "next/link";
import { db } from "@/lib/store";
import { APPEAL_AXES } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const briefs = (await db.briefs.list()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const counts = await Promise.all(
    briefs.map(async (b) => {
      const cs = await db.creatives.listByBrief(b.id);
      return {
        total: cs.length,
        approved: cs.filter((c) => c.status === "approved").length,
        submitted: cs.filter((c) => c.status === "submitted").length,
        rejected: cs.filter((c) => c.status === "rejected").length,
      };
    }),
  );

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-black tracking-tight">ブリーフ一覧</h1>
        <p className="text-sm text-muted">ブリーフから複数案を数分で生成し、プリフライト → 監修 → クライアント承認 → 書き出しまでを一本で回します。</p>
      </section>

      {briefs.length === 0 ? (
        <div className="card flex flex-col items-start gap-4 p-8">
          <div>
            <h2 className="text-lg font-black">最初のブリーフを作成しましょう</h2>
            <p className="mt-1 text-sm text-muted">クライアント名・LP URL・オファー・ターゲットを入力すると、訴求軸 × ビジュアル × 動きの組み合わせでポップアップ案を生成します。</p>
          </div>
          <Link href="/briefs/new" className="btn-primary">
            新しいブリーフを作成
          </Link>
          <div className="mt-2 grid w-full gap-3 sm:grid-cols-3">
            {[
              ["① ブリーフ", "LP URLから配色と訴求点を自動抽出。仮説グリッドで案の組み合わせを選ぶ"],
              ["② 生成 & プリフライト", "HTML/CSSテンプレートで日本語を正確に描画。コントラスト・文字数・要注意表現を自動チェック"],
              ["③ 承認 & 書き出し", "クライアントは実機プレビューで承認。承認済み案をPNG/GIF + manifestでZIP書き出し"],
            ].map(([t, d]) => (
              <div key={t} className="rounded-md border border-line bg-bg p-3">
                <div className="text-sm font-black">{t}</div>
                <div className="mt-1 text-xs text-muted">{d}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {briefs.map((b, i) => (
            <li key={b.id} className="card p-4">
              <Link href={`/briefs/${b.id}`} className="block">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-black">{b.clientName}</div>
                    <div className="truncate text-xs text-muted">{b.offer || b.lpUrl}</div>
                  </div>
                  <span className="chip bg-accent-soft text-accent">{b.deviceSize.toUpperCase()}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {b.appealAxes.map((a) => (
                    <span key={a} className="chip border border-line text-muted">
                      {APPEAL_AXES.find((x) => x.id === a)?.label}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex gap-4 text-xs text-muted tabular-nums">
                  <span>案 {counts[i].total}</span>
                  <span>提出中 {counts[i].submitted}</span>
                  <span className="text-accent">承認 {counts[i].approved}</span>
                  <span className="text-danger">差戻し {counts[i].rejected}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
