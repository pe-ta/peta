/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { Creative, PreflightResult } from "@/lib/types";
import { appealLabel, MOTIONS, normalizeMotion, normalizeVisual, VISUAL_AXES } from "@/lib/types";
import { getTemplate } from "@/lib/templates";
import { StatusChip } from "./StatusChip";
import { creativeImageUrl } from "@/lib/urls";
import { ScoreBadge } from "./ScoreBadge";

export function CreativeCard({
  creative,
  preflight,
  deviceSize,
  selectable,
  isChampion,
  briefUpdatedAt,
}: {
  creative: Creative;
  preflight: PreflightResult;
  deviceSize: "sp" | "pc";
  selectable?: boolean;
  isChampion?: boolean;
  briefUpdatedAt: string;
}) {
  // Thumbnails are always the still frame: GIFs take seconds to render and the grid loads 6-12 at once.
  const aspect = deviceSize === "sp" ? "900 / 1265" : "1 / 1";
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
          src={creativeImageUrl(creative, { updatedAt: briefUpdatedAt }, "png")}
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
            <span className="chip border border-line text-muted">{appealLabel(creative.appealAxis)}</span>
            <span className="chip border border-line text-muted">{getTemplate(creative.templateId).name.replace(/型$/, "")}</span>
            <span className="chip border border-line text-muted">{VISUAL_AXES.find((v) => v.id === normalizeVisual(creative.visualAxis))?.label.replace(/ブランド色の/, "")}</span>
            <span className={`chip ${normalizeMotion(creative.motion) === "static" ? "border border-line text-muted" : "bg-warn-soft text-warn"}`}>{MOTIONS.find((m) => m.id === normalizeMotion(creative.motion))?.label.replace(/（.*）/, "")}</span>
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
