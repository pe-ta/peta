import Link from "next/link";
import type { Brief, Creative } from "@/lib/types";
import { compare } from "@/lib/stats";

/**
 * One box that tells the AP what to do next, derived from the state of the brief.
 * The experiment loop has a fixed order; this keeps people from guessing.
 */
export function NextStep({ brief, creatives, reviewPath }: { brief: Brief; creatives: Creative[]; reviewPath: string }) {
  const champion = creatives.find((c) => c.id === brief.championId);
  const live = creatives.filter((c) => c.status === "live" && c.id !== brief.championId);
  const candidates = creatives.filter((c) => !["live", "ended"].includes(c.status));
  const unanalyzed = candidates.filter((c) => !c.critique);
  const submitted = creatives.filter((c) => c.status === "submitted");
  const approved = creatives.filter((c) => c.status === "approved");
  const rejected = creatives.filter((c) => c.status === "rejected");
  const drafts = creatives.filter((c) => ["draft", "reviewing"].includes(c.status));

  let step = 1;
  let title = "";
  let body: React.ReactNode = null;

  const wonChallenger = live.find((c) => compare(brief.winMetric, c.results, champion?.results).verdict === "won");
  const lostChallenger = live.find((c) => compare(brief.winMetric, c.results, champion?.results).verdict === "lost");
  const needsResults = live.filter((c) => !c.results || c.results.impressions === 0);

  if (creatives.length === 0) {
    step = 1;
    title = "候補を生成する";
    body = <>候補がありません。「下書きを再生成」を押すか、<Link href={`/briefs/${brief.id}/edit`} className="underline">ブリーフを編集</Link>してから再生成してください。</>;
  } else if (wonChallenger) {
    step = 6;
    title = "勝った挑戦者をチャンピオンに昇格する";
    body = <>「{wonChallenger.slots.headline}」に勝ち判定が出ています。実験の欄で「チャンピオンに昇格」を押すと、学びログに自動記録され、次の仮説を書けます。</>;
  } else if (lostChallenger) {
    step = 6;
    title = "負けた挑戦者を終了する";
    body = <>「{lostChallenger.slots.headline}」は負け判定です。「負けとして終了」で記録し、次の候補を提出しましょう。</>;
  } else if (needsResults.length > 0) {
    step = 5;
    title = "配信結果を入力する";
    body = <>配信中の {needsResults.length} 案に結果（表示・クリック・LINE追加・CV）がありません。配信基盤の管理画面の数値を実験の欄に入力してください。双方 300 表示以上で判定が出ます。</>;
  } else if (approved.length > 0) {
    step = 4;
    title = "承認済みの案を配信に投入する";
    body = <>{approved.length} 案が承認済みです。「全案を書き出し」で PNG/GIF を入稿したら、実験の欄の「配信開始」を押してください。{!champion && "最初の案がチャンピオン（比較の基準）になります。"}</>;
  } else if (submitted.length > 0) {
    step = 3;
    title = "クライアントの承認を待つ";
    body = (
      <>
        {submitted.length} 案が確認待ちです。まだ送っていなければ承認ポータルのリンク（<code className="rounded bg-bg px-1">{reviewPath}</code>）をクライアントに送ってください。3 日以内に返事がなければリマインドを。
      </>
    );
  } else if (rejected.length > 0 && drafts.length === 0) {
    step = 2;
    title = "差戻しを直して再提出する";
    body = <>{rejected.length} 案が差戻しです。フィードバックの理由タグを見て、案を編集するか別の訴求軸の候補を再生成してください。</>;
  } else if (unanalyzed.length > 0) {
    step = 2;
    title = "辛口分析でふるいにかける";
    body = <>未分析の候補が {unanalyzed.length} 案あります。「未分析 {unanalyzed.length} 案を辛口分析」を押し、70 点以上を提出候補にしてください。50 点未満は直すより捨てる方が速いです。</>;
  } else if (drafts.length > 0) {
    step = 3;
    title = "クライアントに提出する";
    body = <>分析済みの候補から、仮説が異なる 2〜3 案にチェックを入れて「クライアントに提出」。似た案を並べると承認で迷わせます。</>;
  } else if (live.length > 0) {
    step = 5;
    title = "計測中";
    body = <>判定が出るまで結果を更新してください（勝つ確率 95% 以上で勝ち、5% 以下で負け）。並行して次の候補を再生成しておくと、結論が出た瞬間に次の実験に入れます。</>;
  } else {
    step = 1;
    title = "次の挑戦者を用意する";
    body = <>チャンピオンだけが配信中です。学びログの「次に試す仮説」をもとに「下書きを再生成」し、挑戦者を投入してください。</>;
  }

  return (
    <div className="flex gap-3 rounded-lg border border-accent/40 bg-accent-soft/40 p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-black text-white">{step}</div>
      <div className="min-w-0">
        <div className="text-xs font-bold text-accent">次にやること</div>
        <div className="text-base font-black">{title}</div>
        <p className="mt-1 text-sm">{body}</p>
      </div>
    </div>
  );
}
