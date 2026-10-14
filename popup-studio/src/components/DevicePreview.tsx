/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";

/**
 * In-situ preview: the popup composited over the client's LP screenshot
 * inside a phone or desktop frame, with the dark overlay and close button.
 */
export function DevicePreview({
  imageUrl,
  deviceSize,
  lpImage,
  title,
}: {
  imageUrl: string;
  deviceSize: "sp" | "pc";
  lpImage?: string;
  title: string;
}) {
  const [shot, setShot] = useState<string | undefined>(lpImage);
  const [showOverlay, setShowOverlay] = useState(true);
  const isSp = deviceSize === "sp";

  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative mx-auto overflow-hidden rounded-[28px] border-[6px] border-neutral-900 bg-neutral-200 shadow-xl"
        style={isSp ? { width: 300, height: 620 } : { width: "100%", maxWidth: 720, aspectRatio: "16 / 10", borderRadius: 12, borderWidth: 4 }}
      >
        {shot ? (
          <img src={shot} alt="LP" className="absolute inset-0 h-full w-full object-cover object-top" />
        ) : (
          <div className="absolute inset-0 flex flex-col gap-3 p-4">
            <div className="h-6 w-2/3 rounded bg-neutral-300" />
            <div className="h-28 rounded bg-neutral-300" />
            <div className="h-3 w-full rounded bg-neutral-300" />
            <div className="h-3 w-5/6 rounded bg-neutral-300" />
            <div className="h-3 w-4/6 rounded bg-neutral-300" />
            <div className="h-10 w-1/2 rounded bg-neutral-300" />
          </div>
        )}
        {showOverlay && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/55 p-4">
            <div className="relative" style={{ width: isSp ? "88%" : "60%" }}>
              <img src={imageUrl} alt={title} className="w-full rounded-2xl shadow-2xl" />
              <button
                type="button"
                aria-label="閉じる"
                onClick={() => setShowOverlay(false)}
                className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm font-black text-neutral-800 shadow"
              >
                ×
              </button>
            </div>
          </div>
        )}
        {!showOverlay && (
          <button type="button" onClick={() => setShowOverlay(true)} className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-neutral-900/80 px-3 py-1 text-xs font-bold text-white">
            ポップアップを再表示
          </button>
        )}
      </div>
      <label className="flex flex-col gap-1 text-xs text-muted">
        <span>LP のスクリーンショットを重ねる（任意・端末内でのみ使用）</span>
        <input
          type="file"
          accept="image/*"
          className="text-xs"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = () => setShot(String(reader.result));
            reader.readAsDataURL(f);
          }}
        />
      </label>
    </div>
  );
}
