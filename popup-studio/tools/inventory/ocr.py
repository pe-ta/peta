#!/usr/bin/env python3
"""OCR every creative (first frame) and emit one JSON line per file with positioned text.

Usage:
  python3 -I ocr.py --src <raw dir> --out <ocr.jsonl> [--limit N]

Each line: {"name", "width", "height", "boxes": [{"text", "conf", "x0","y0","x1","y1" (0-1 relative), "h" (relative height)}]}
Requires easyocr with the Japanese model in ~/.EasyOCR/model (japanese_g2.pth, craft_mlt_25k.pth).
Resumable: names already present in --out are skipped.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--max-side", type=int, default=1000)
    args = ap.parse_args()
    import easyocr  # heavy import, keep it local

    reader = easyocr.Reader(["ja", "en"], gpu=False, verbose=False)
    out = Path(args.out)
    done = set()
    if out.exists():
        for line in out.open(encoding="utf-8"):
            try:
                done.add(json.loads(line)["name"])
            except Exception:  # noqa: BLE001
                pass
    files = sorted(p for p in Path(args.src).iterdir() if p.suffix.lower() in IMAGE_EXT and p.name not in done)
    if args.limit:
        files = files[: args.limit]
    with out.open("a", encoding="utf-8") as f:
        for i, p in enumerate(files, 1):
            try:
                with Image.open(p) as im:
                    im.seek(0)
                    rgb = im.convert("RGB")
                    w, h = rgb.size
                    scale = min(1.0, args.max_side / max(w, h))
                    if scale < 1.0:
                        rgb = rgb.resize((int(w * scale), int(h * scale)))
                    arr = np.asarray(rgb)
                res = reader.readtext(arr, detail=1, paragraph=False, text_threshold=0.6, low_text=0.35)
                boxes = []
                sw, sh = arr.shape[1], arr.shape[0]
                for pts, text, conf in res:
                    xs = [pt[0] for pt in pts]
                    ys = [pt[1] for pt in pts]
                    boxes.append({
                        "text": text, "conf": round(float(conf), 3),
                        "x0": round(min(xs) / sw, 3), "y0": round(min(ys) / sh, 3), "x1": round(max(xs) / sw, 3), "y1": round(max(ys) / sh, 3),
                        "h": round((max(ys) - min(ys)) / sh, 3),
                    })
                f.write(json.dumps({"name": p.name, "width": w, "height": h, "boxes": boxes}, ensure_ascii=False) + "\n")
                f.flush()
            except Exception as e:  # noqa: BLE001
                f.write(json.dumps({"name": p.name, "error": str(e)[:200]}, ensure_ascii=False) + "\n")
                f.flush()
            if i % 25 == 0:
                print(f"{i}/{len(files)}", file=sys.stderr, flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
