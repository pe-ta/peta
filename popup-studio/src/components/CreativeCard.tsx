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
}: {
  creative: Creative;
  preflight: PreflightResult;
  deviceSize: "sp" | "pc";
  selectable?: boolean;
}) {
  const fmt = creative.motion === "static" ? "png" : "gif";
  const aspect = deviceSize === "sp" ? "4 / 5" : "8 / 5";
  return (
    <div className="card flex flex-col overflow-hidden">
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
            <span className="chip bg-accent-soft text-accent">{APPEAL_AXES.find((a) => a.id === creative.appealAxis)?.label}</span>
            <span className="chip border border-line text-muted">{creative.visualAxis === "image" ? "画像" : "テキスト"}</span>
            <span className="chip border border-line text-muted">{MOTIONS.find((m) => m.id === creative.motion)?.label.replace(/（.*）/, "")}</span>
          </div>
          <ScoreBadge score={preflight.score} />
        </div>
        <div className="line-clamp-2 text-sm font-bold leading-snug">{creative.slots.headline}</div>
        <div className="line-clamp-2 text-xs text-muted">仮説: {creative.hypothesis}</div>
        <div className="flex items-center justify-between pt-1">
          <StatusChip status={creative.status} />
          {selectable && creative.status !== "approved" && (
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
