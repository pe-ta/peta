import { importResultsAction } from "@/lib/actions";
import { todayJst } from "@/lib/results";
import { PendingButton } from "./PendingButton";

/** Paste the delivery platform's export; rows are matched by creative id (the zc= parameter). */
export function ResultsImport({ briefId, creativeIds, pushUrl, pushToken, pushDisabled }: { briefId: string; creativeIds: string[]; pushUrl: string; pushToken: string; pushDisabled?: boolean }) {
  const today = todayJst();
  const sample = `creative_id,date,impressions,clicks,line_adds,conversions\n${creativeIds.slice(0, 2).map((id, i) => `${id},${today},${1200 + i * 100},80,41,5`).join("\n")}`;
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
      <div className="mt-3 rounded-md bg-bg p-3 text-xs">
        <div className="font-black">自動連携（配信基盤やスクリプトから送る）</div>
        <p className="mt-1 text-muted">同じ CSV（または JSON の行配列）を次の URL に POST すると貼り付け無しで取り込まれます。トークンはこのブリーフ専用です。</p>
        {pushDisabled ? (
          <p className="mt-2 rounded bg-warn-soft p-2 font-bold text-warn">いまは無効です。Vercel の環境変数 REVIEW_SECRET を設定して再デプロイすると使えます（トークンも設定後の値に変わります）。</p>
        ) : (
        <pre className="mt-2 overflow-x-auto rounded bg-surface p-2 font-mono text-[11px]">{`curl -X POST "${pushUrl}" \\
  -H "Authorization: Bearer ${pushToken}" \\
  -H "Content-Type: text/csv" \\
  --data-binary @results.csv`}</pre>
        )}
      </div>
    </details>
  );
}
