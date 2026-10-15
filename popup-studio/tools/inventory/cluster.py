#!/usr/bin/env python3
"""Cluster popup thumbnails into layout archetypes and render contact sheets for review.

Usage:
  python3 -I cluster.py --inventory <out-dir from inventory.py> --k 12

Reads <out>/inventory.csv and <out>/thumbs/*.png, writes <out>/clusters.json
(cluster -> member names, centroid stats) and <out>/sheets/cluster_NN.png.
Features: 12x17 grayscale map of the first frame (layout), mean colour, edge
density and the row/column edge signature. Plain numpy k-means, fixed seed.
"""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

TW, TH = 150, 211  # 900x1265 aspect
COLS, ROWS = 6, 5


def features(thumb: Path) -> np.ndarray:
    with Image.open(thumb) as im:
        rgb = im.convert("RGB")
        g = np.asarray(rgb.convert("L").resize((12, 17)), dtype=np.float32) / 255.0
        mean = np.asarray(rgb.resize((1, 1)), dtype=np.float32).reshape(3) / 255.0
    return np.concatenate([g.ravel() * 1.0, mean * 4.0])


def kmeans(x: np.ndarray, k: int, seed: int = 7, iters: int = 60) -> np.ndarray:
    rng = np.random.default_rng(seed)
    # k-means++ init
    centers = [x[rng.integers(len(x))]]
    for _ in range(1, k):
        d = np.min([((x - c) ** 2).sum(1) for c in centers], axis=0)
        centers.append(x[rng.choice(len(x), p=d / d.sum())])
    c = np.stack(centers)
    labels = np.zeros(len(x), dtype=int)
    for _ in range(iters):
        d = ((x[:, None, :] - c[None, :, :]) ** 2).sum(2)
        new = d.argmin(1)
        if (new == labels).all():
            break
        labels = new
        for j in range(k):
            if (labels == j).any():
                c[j] = x[labels == j].mean(0)
    return labels


def sheet(paths: list[Path], labels: list[str], out: Path, title: str) -> None:
    n = min(len(paths), COLS * ROWS)
    W, H = COLS * (TW + 8) + 8, ROWS * (TH + 22) + 36
    img = Image.new("RGB", (W, H), "#202020")
    dr = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/home/user/peta/popup-studio/assets/fonts/NotoSansJP-Regular.woff", 11)
    except Exception:  # noqa: BLE001
        font = ImageFont.load_default()
    dr.text((8, 8), title, fill="#ffffff", font=font)
    for i in range(n):
        r, cidx = divmod(i, COLS)
        x, y = 8 + cidx * (TW + 8), 36 + r * (TH + 22)
        with Image.open(paths[i]) as t:
            t = t.convert("RGB")
            t.thumbnail((TW, TH))
            img.paste(t, (x + (TW - t.width) // 2, y))
        dr.text((x, y + TH + 4), labels[i][:26], fill="#dddddd", font=font)
    img.save(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--inventory", required=True)
    ap.add_argument("--k", type=int, default=12)
    ap.add_argument("--kinds", default="popup,unlabeled,unknown")
    args = ap.parse_args()
    out = Path(args.inventory)
    kinds = set(args.kinds.split(","))
    rows = [r for r in csv.DictReader((out / "inventory.csv").open(encoding="utf-8")) if r["kind"] in kinds and r["format"] != "VIDEO"]
    thumbs = [out / "thumbs" / (Path(r["name"]).stem + ".png") for r in rows]
    keep = [i for i, t in enumerate(thumbs) if t.exists()]
    rows, thumbs = [rows[i] for i in keep], [thumbs[i] for i in keep]
    x = np.stack([features(t) for t in thumbs])
    labels = kmeans(x, args.k)
    sheets = out / "sheets"
    sheets.mkdir(exist_ok=True)
    clusters = {}
    rng = np.random.default_rng(1)
    for j in range(args.k):
        idx = np.where(labels == j)[0]
        if not len(idx):
            continue
        # order by distance to centroid so the sheet shows the most typical members first
        c = x[idx].mean(0)
        order = idx[np.argsort(((x[idx] - c) ** 2).sum(1))]
        gifs = sum(1 for i in idx if rows[i]["format"] == "GIF")
        clusters[f"c{j:02d}"] = {
            "size": int(len(idx)),
            "gif": gifs,
            "mean_edge_density": round(float(np.mean([float(rows[i]["edge_density"] or 0) for i in idx])), 3),
            "members": [rows[i]["name"] for i in order],
        }
        sample = list(order[: COLS * ROWS - 6]) + list(rng.choice(order[COLS * ROWS - 6 :], size=min(6, max(0, len(order) - (COLS * ROWS - 6))), replace=False)) if len(order) > COLS * ROWS else list(order)
        sheet([thumbs[i] for i in sample], [f"{i}:{rows[i]['client']}" for i in sample], sheets / f"cluster_{j:02d}.png", f"cluster {j:02d}  n={len(idx)}  gif={gifs}")
    (out / "clusters.json").write_text(json.dumps(clusters, ensure_ascii=False, indent=1), encoding="utf-8")
    for k, v in clusters.items():
        print(k, v["size"], "gif", v["gif"], "edge", v["mean_edge_density"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
