import type { PreflightResult } from "@/lib/types";
import { ScoreBadge } from "./ScoreBadge";

export function PreflightList({ result }: { result: PreflightResult }) {
  const sevCls = { error: "bg-danger-soft text-danger", warn: "bg-warn-soft text-warn", info: "bg-bg text-muted border border-line" };
  const sevLabel = { error: "要修正", warn: "注意", info: "情報" };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black">プリフライト</h3>
        <ScoreBadge score={result.score} />
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs tabular-nums sm:grid-cols-4">
        <div className="rounded-md bg-bg p-2"><dt className="text-muted">見出しコントラスト</dt><dd className="font-bold">{result.metrics.contrastHeadline.toFixed(1)}:1</dd></div>
        <div className="rounded-md bg-bg p-2"><dt className="text-muted">CTAコントラスト</dt><dd className="font-bold">{result.metrics.contrastCta.toFixed(1)}:1</dd></div>
        <div className="rounded-md bg-bg p-2"><dt className="text-muted">最小文字</dt><dd className="font-bold">{result.metrics.minFontPx}px</dd></div>
        <div className="rounded-md bg-bg p-2"><dt className="text-muted">見出し文字数</dt><dd className="font-bold">{result.metrics.headlineChars}</dd></div>
      </dl>
      {result.issues.length === 0 ? (
        <p className="text-xs text-accent font-bold">指摘はありません。</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {result.issues.map((i, idx) => (
            <li key={idx} className="flex gap-2 rounded-md border border-line p-2 text-xs">
              <span className={`chip shrink-0 ${sevCls[i.severity]}`}>{sevLabel[i.severity]}</span>
              <span>
                <span className="font-bold">{i.message}</span>
                {i.suggestion && <span className="block text-muted">→ {i.suggestion}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
