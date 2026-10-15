import { importResultsAction } from "@/lib/actions";
import { PendingButton } from "./PendingButton";

/** Paste the delivery platform's export; rows are matched by creative id (the zc= parameter). */
export function ResultsImport({ briefId, creativeIds }: { briefId: string; creativeIds: string[] }) {
  const sample = `creative_id,date,impressions,clicks,line_adds,conversions\n${creativeIds.slice(0, 2).map((id, i) => `${id},${new Date().toISOString().slice(0, 10)},${1200 + i * 100},80,41,5`).join("\n")}`;
  return (
    <details className="rounded-md border border-line p-3 text-sm">
      <summary className="cursor-pointer text-xs font-black">配信結果を CSV で取り込む</summary>
      <form action={importResultsAction} className="mt-2 flex flex-col gap-2">
        <input type="hidden" name="briefId" value={briefId} />
        <p className="text-xs text-muted">
          配信基盤の書き出しを貼り付けてください（カンマ区切りかタブ区切り、1 行目は見出し）。列は 案ID（creative_id / zc）・日付・表示・タップ・LINE追加・CV・ブロック。数値はその日までの累計。日付ごとに保存され、最新の行が案の結果になります。
        </p>
        <textarea name="csv" rows={5} className="input font-mono text-xs" placeholder={sample} />
        <div className="flex justify-end">
          <PendingButton pendingText="取り込み中…" className="btn-ghost py-1 text-xs">取り込む</PendingButton>
        </div>
      </form>
    </details>
  );
}
