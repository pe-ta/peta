/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { Creative, PreflightResult } from "@/lib/types";
import { APPEAL_AXES, MOTIONS } from "@/lib/types";
import { StatusChip } from "./StatusChip";
import { ScoreBadge } from "./ScoreBadge";

export function CreativeCard({
  creative,
  preflight,
  deviceSize,
  selectable,
  isChampion,
}: {
  creative: Creative;
  preflight: PreflightResult;
  deviceSize: "sp" | "pc";
  selectable?: boolean;
  isChampion?: boolean;
}) {
  const fmt = creative.motion === "static" ? "png" : "gif";
  const aspect = deviceSize === "sp" ? "4 / 5" : "8 / 5";
  const critique = creative.critique;
  return (
    <div className={`card flex flex-col overflow-hidden ${isChampion ? "ring-2 ring-accent" : ""}`}>
      <div className="flex items-start gap-2 border-b border-line bg-bg px-3 py-2">
        <span className="chip shrink-0 bg-accent-soft text-accent">仮説</span>
        <Link href={`/creatives/${creative.id}`} className="line-clamp-2 text-xs font-bold leading-snug hover:underline">
          {creative.hypothesis}
        </Link>
      </div>
      <Link href={`/creatives/${creative.id}`} className="block bg-bg p-3">
        <img
          src={`/api/creatives/${creative.id}/image?fmt=${fmt}&v=${creative.version}`}
          alt={creative.slots.headline}
          style={{ aspectRatio: aspect }}
          className="w-full rounded-md object-contain"
          loading="lazy"
        />
      </Link>
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {isChampion && <span className="chip bg-accent text-white">チャンピオン</span>}
            <span className="chip border border-line text-muted">{APPEAL_AXES.find((a) => a.id === creative.appealAxis)?.label}</span>
            <span className="chip border border-line text-muted">{creative.visualAxis === "image" ? "画像" : "テキスト"}</span>
            <span className="chip border border-line text-muted">{MOTIONS.find((m) => m.id === creative.motion)?.label.replace(/（.*）/, "")}</span>
          </div>
          <div className="flex items-center gap-1" title="辛口分析 / プリフライト">
            {critique ? (
              <span className={`chip tabular-nums ${critique.overall >= 70 ? "bg-accent-soft text-accent" : critique.overall >= 50 ? "bg-warn-soft text-warn" : "bg-danger-soft text-danger"}`}>
                辛口 {critique.overall}
              </span>
            ) : (
              <span className="chip border border-line text-muted">未分析</span>
            )}
            <ScoreBadge score={preflight.score} />
          </div>
        </div>
        <div className="line-clamp-1 text-sm font-bold leading-snug">{creative.slots.headline}</div>
        {critique && <div className="line-clamp-1 text-xs text-muted">{critique.verdict}</div>}
        <div className="flex items-center justify-between pt-1">
          <StatusChip status={creative.status} />
          {selectable && ["draft", "reviewing", "rejected"].includes(creative.status) && (
            <label className="flex items-center gap-1.5 text-xs font-bold">
              <input type="checkbox" name="creativeIds" value={creative.id} className="accent-accent" defaultChecked={creative.status === "draft" && preflight.score >= 60} />
              提出に含める
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
