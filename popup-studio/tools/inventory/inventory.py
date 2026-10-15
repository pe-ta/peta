#!/usr/bin/env python3
"""Popup creative inventory.

Walks a directory of past popup creatives (PNG/JPG/GIF/WebP/MP4) and writes:

  inventory.csv   one row per file: name, format, width, height, aspect, bytes,
                  frames, duration_ms, loop, dominant colors, estimated text ratio
  summary.json    spec statistics (size buckets, format mix, GIF stats, palettes)
  thumbs/         256px thumbnails (first frame) for layout clustering and review

Usage:
  python3 -I inventory.py --src <dir-with-files> --out <output-dir>

Only PIL + numpy are required. Files are treated as untrusted data: nothing is
executed, only decoded.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageSequence

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
VIDEO_EXT = {".mp4", ".mov", ".webm"}
Image.MAX_IMAGE_PIXELS = 80_000_000


def aspect_label(w: int, h: int) -> str:
    if not w or not h:
        return "unknown"
    r = w / h
    if abs(r - 1) < 0.08:
        return "square"
    if r < 1:
        return "portrait"
    if r > 1.6:
        return "landscape-wide"
    return "landscape"


def size_bucket(w: int, h: int) -> str:
    """Round to the nearest 20px so near-identical exports group together."""
    return f"{round(w / 20) * 20}x{round(h / 20) * 20}"


def dominant_colors(img: Image.Image, k: int = 4) -> list[dict]:
    """Coarse palette by quantising to 4 bits/channel and counting."""
    small = img.convert("RGB").resize((64, 64))
    arr = np.asarray(small).reshape(-1, 3)
    q = (arr >> 4) << 4
    keys, counts = np.unique(q, axis=0, return_counts=True)
    order = np.argsort(-counts)[:k]
    total = counts.sum()
    out = []
    for i in order:
        r, g, b = (int(v) + 8 for v in keys[i])
        out.append({"hex": f"#{r:02x}{g:02x}{b:02x}", "share": round(float(counts[i]) / total, 3)})
    return out


def edge_density(img: Image.Image) -> float:
    """Proxy for 'how much text/detail': share of high-gradient pixels."""
    g = np.asarray(img.convert("L").resize((128, 128)), dtype=np.float32)
    gx = np.abs(np.diff(g, axis=1))
    gy = np.abs(np.diff(g, axis=0))
    edges = (gx[:-1, :] > 40) | (gy[:, :-1] > 40)
    return round(float(edges.mean()), 3)


def layout_signature(img: Image.Image) -> dict:
    """Where the visual weight sits: per-third edge density (top/mid/bottom, left/center/right)."""
    g = np.asarray(img.convert("L").resize((96, 96)), dtype=np.float32)
    gx = np.abs(np.diff(g, axis=1))[:-1, :]
    gy = np.abs(np.diff(g, axis=0))[:, :-1]
    e = ((gx > 40) | (gy > 40)).astype(np.float32)
    rows = [round(float(e[i * 32:(i + 1) * 32, :].mean()), 3) for i in range(3)] if e.shape[0] >= 95 else []
    cols = [round(float(e[:, i * 32:(i + 1) * 32].mean()), 3) for i in range(3)] if e.shape[1] >= 95 else []
    return {"rows": rows, "cols": cols}


def analyse_image(path: Path, thumb_dir: Path) -> dict:
    row: dict = {"name": path.name, "ext": path.suffix.lower(), "bytes": path.stat().st_size}
    with Image.open(path) as im:
        row["format"] = im.format
        row["width"], row["height"] = im.size
        n_frames = getattr(im, "n_frames", 1)
        row["frames"] = n_frames
        duration = 0
        if n_frames > 1:
            for frame in ImageSequence.Iterator(im):
                duration += int(frame.info.get("duration", 0) or 0)
            row["loop"] = im.info.get("loop", None)
        row["duration_ms"] = duration
        im.seek(0)
        first = im.convert("RGB")
        row["palette"] = dominant_colors(first)
        row["edge_density"] = edge_density(first)
        row["layout"] = layout_signature(first)
        thumb = first.copy()
        thumb.thumbnail((256, 256))
        thumb.save(thumb_dir / (path.stem + ".png"))
    row["aspect"] = aspect_label(row["width"], row["height"])
    row["bucket"] = size_bucket(row["width"], row["height"])
    return row


def analyse_video(path: Path) -> dict:
    return {"name": path.name, "ext": path.suffix.lower(), "bytes": path.stat().st_size, "format": "VIDEO", "width": 0, "height": 0, "frames": 0, "duration_ms": 0, "aspect": "unknown", "bucket": "video", "palette": [], "edge_density": None, "layout": {}}


NAME_TOKENS = re.compile(r"[\s_\-()（）【】\[\]・.]+")


def name_tokens(name: str) -> list[str]:
    stem = Path(name).stem
    return [t for t in NAME_TOKENS.split(stem) if t and not t.isdigit()]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    src, out = Path(args.src), Path(args.out)
    thumb_dir = out / "thumbs"
    thumb_dir.mkdir(parents=True, exist_ok=True)

    rows: list[dict] = []
    errors: list[dict] = []
    files = sorted(p for p in src.rglob("*") if p.is_file())
    for i, p in enumerate(files, 1):
        ext = p.suffix.lower()
        try:
            if ext in IMAGE_EXT:
                rows.append(analyse_image(p, thumb_dir))
            elif ext in VIDEO_EXT:
                rows.append(analyse_video(p))
            else:
                errors.append({"name": p.name, "error": f"unsupported extension {ext}"})
        except Exception as e:  # noqa: BLE001 - we want to keep going on corrupt files
            errors.append({"name": p.name, "error": str(e)[:200]})
        if i % 100 == 0:
            print(f"{i}/{len(files)}", file=sys.stderr)

    # CSV
    cols = ["name", "format", "ext", "width", "height", "aspect", "bucket", "bytes", "frames", "duration_ms", "loop", "edge_density", "palette", "layout"]
    with (out / "inventory.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            r2 = dict(r)
            r2["palette"] = " ".join(c["hex"] for c in r.get("palette", []))
            r2["layout"] = json.dumps(r.get("layout", {}), ensure_ascii=False)
            w.writerow(r2)

    # Summary
    imgs = [r for r in rows if r["format"] != "VIDEO"]
    gifs = [r for r in imgs if r["frames"] > 1]
    by_bucket = Counter(r["bucket"] for r in imgs)
    by_format = Counter(r["format"] for r in rows)
    by_aspect = Counter(r["aspect"] for r in imgs)
    sizes = np.array([r["bytes"] for r in rows]) if rows else np.array([0])
    frames = np.array([r["frames"] for r in gifs]) if gifs else np.array([0])
    durs = np.array([r["duration_ms"] for r in gifs]) if gifs else np.array([0])
    tokens = Counter(t for r in rows for t in name_tokens(r["name"]))
    palette = Counter()
    for r in imgs:
        for c in r["palette"][:2]:
            palette[c["hex"]] += 1

    summary = {
        "files": len(files),
        "analysed": len(rows),
        "errors": len(errors),
        "formats": dict(by_format.most_common()),
        "aspect": dict(by_aspect.most_common()),
        "size_buckets_top": by_bucket.most_common(15),
        "bytes": {"p50": int(np.percentile(sizes, 50)), "p90": int(np.percentile(sizes, 90)), "max": int(sizes.max())},
        "gif": {
            "count": len(gifs),
            "share_of_images": round(len(gifs) / len(imgs), 3) if imgs else 0,
            "frames": {"p50": int(np.percentile(frames, 50)), "p90": int(np.percentile(frames, 90)), "max": int(frames.max())},
            "duration_ms": {"p50": int(np.percentile(durs, 50)), "p90": int(np.percentile(durs, 90)), "max": int(durs.max())},
        },
        "name_tokens_top": tokens.most_common(60),
        "palette_top": palette.most_common(20),
    }
    (out / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    (out / "errors.json").write_text(json.dumps(errors, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: summary[k] for k in ("files", "analysed", "errors", "formats", "aspect", "gif")}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
