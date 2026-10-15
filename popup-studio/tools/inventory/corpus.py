#!/usr/bin/env python3
"""Turn OCR output into a copy corpus and per-file DNA tags.

Usage:
  python3 -I corpus.py --inventory <out dir> --ocr <ocr.jsonl>

Writes <out>/copy_corpus.json (eyebrows, headlines, button labels, badges with counts)
and <out>/tags.jsonl (one line per file: slots + heuristic tags).

Slot heuristics (relative to image height):
  eyebrow  = text in the top 14% (ribbon / "LINEで無料診断！")
  buttons  = text in the bottom 22% with short length (<= 12 chars)
  headline = the tallest text box(es) outside those bands
  badge    = short text containing 30秒 / 無料 / 簡単 / かんたん / LINE outside buttons
"""
from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter
from pathlib import Path

POSITIVE = re.compile(r"はい|YES|診断|チェック|知りたい|やってみる|見つけ|する|申し込|受け取|スタート|気になる|利用|相談|試す|見てみる|サンプル|ほしい|欲しい|はじめる|始める")
NEGATIVE = re.compile(r"いいえ|NO|また今度|やらない|今じゃない|しない|興味ない|けっこう|結構")
BADGE = re.compile(r"30秒|無料|簡単|かんたん|カンタン|\d+問|\d+分|LINE")
HOOK_RULES = [
    ("invitation", re.compile(r"招待状|招待")),
    ("campaign", re.compile(r"キャンペーン|プレゼント|OFF|％|%|万円|無料体験|モニター|特典|クーポン|0円")),
    ("price", re.compile(r"いくら|価格|料金|費用|かかる|安く")),
    ("quiz", re.compile(r"でしょうか|クイズ|Q\.|答え")),
    ("type_choice", re.compile(r"どっち|どれ|どちら|タイプ")),
    ("pain", re.compile(r"不安|悩|困|迷|モヤモヤ|疲れ|薄く|生えて|痛|続かない|しんどい|面倒")),
    ("compatibility", re.compile(r"相性|ぴったり|ピッタリ|合う|合って|あって|合った|診断|チェック")),
]

# Frequent OCR confusions in this corpus (EasyOCR, Japanese display fonts).
OCR_FIX = [
    (re.compile(r"また今慶"), "また今度"),
    (re.compile(r"秘"), "秒"),
    (re.compile(r"チェツク"), "チェック"),
    (re.compile(r"\[NE|LNE|L1NE|LlNE"), "LINE"),
    (re.compile(r"Al(?=[^a-z])"), "AI"),
    (re.compile(r"[』『「」:：;；・.]+$"), ""),
    (re.compile(r"^[』『「」:：;；・.]+"), ""),
]


def norm(t: str) -> str:
    t = re.sub(r"\s+", "", t).replace("！", "!").replace("？", "?")
    for rx, rep in OCR_FIX:
        t = rx.sub(rep, t)
    return t


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--inventory", required=True)
    ap.add_argument("--ocr", required=True)
    args = ap.parse_args()
    out = Path(args.inventory)
    inv = {r["name"]: r for r in csv.DictReader((out / "inventory.csv").open(encoding="utf-8"))}
    clusters = {}
    cj = out / "clusters.json"
    if cj.exists():
        for cid, c in json.loads(cj.read_text(encoding="utf-8")).items():
            for n in c["members"]:
                clusters[n] = cid

    eyebrows, headlines, buttons, badges, pairs, hooks = Counter(), Counter(), Counter(), Counter(), Counter(), Counter()
    structures = Counter()
    n_ok = 0
    with (out / "tags.jsonl").open("w", encoding="utf-8") as tf:
        for line in Path(args.ocr).open(encoding="utf-8"):
            rec = json.loads(line)
            if "boxes" not in rec:
                continue
            n_ok += 1
            boxes = [b for b in rec["boxes"] if b["conf"] >= 0.55 and norm(b["text"])]
            top = [b for b in boxes if b["y1"] <= 0.16]
            bottom = [b for b in boxes if b["y0"] >= 0.76 and len(norm(b["text"])) <= 12]
            middle = [b for b in boxes if b not in top and b not in bottom]
            eyebrow = norm(" ".join(b["text"] for b in sorted(top, key=lambda b: (b["y0"], b["x0"]))))
            # headline: tallest 2 boxes in the middle, read in y order
            tall = sorted(middle, key=lambda b: -b["h"])[:2]
            headline = norm(" ".join(b["text"] for b in sorted(tall, key=lambda b: (b["y0"], b["x0"]))))
            btn_labels = [norm(b["text"]) for b in sorted(bottom, key=lambda b: b["x0"])]
            pos = [t for t in btn_labels if POSITIVE.search(t) and not NEGATIVE.search(t)]
            neg = [t for t in btn_labels if NEGATIVE.search(t)]
            badge = [norm(b["text"]) for b in middle if BADGE.search(b["text"]) and len(norm(b["text"])) <= 14 and b["h"] < 0.05]
            structure = "two_buttons" if (pos and neg) else "single_cta" if (pos or btn_labels) else "no_button_detected"
            if len(btn_labels) >= 3 and not neg:
                structure = "multi_choice"
            alltext = norm(" ".join(b["text"] for b in boxes))
            hook = next((h for h, rx in HOOK_RULES if rx.search(eyebrow + " " + headline)), None)
            if hook is None:
                hook = next((h for h, rx in HOOK_RULES if rx.search(alltext)), "other")
            if structure == "multi_choice" and hook in ("other", "compatibility"):
                hook = "type_choice"
            hook_all = [h for h, rx in HOOK_RULES if rx.search(alltext)]
            inv_row = inv.get(rec["name"], {})
            tags = {
                "name": rec["name"], "client": inv_row.get("client"), "job": inv_row.get("job"),
                "spec": f'{inv_row.get("width")}x{inv_row.get("height")}', "format": inv_row.get("format"),
                "animated": int(inv_row.get("frames") or 1) > 1, "frames": int(inv_row.get("frames") or 1),
                "cluster": clusters.get(rec["name"]),
                "eyebrow": eyebrow, "headline": headline, "buttons": btn_labels, "positive": pos, "negative": neg,
                "badges": badge, "structure": structure, "hook": hook, "hook_all": hook_all,
                "text_boxes": len(boxes), "text_chars": len(alltext),
            }
            tf.write(json.dumps(tags, ensure_ascii=False) + "\n")
            if eyebrow:
                eyebrows[eyebrow] += 1
            if headline:
                headlines[headline] += 1
            for t in btn_labels:
                buttons[t] += 1
            for t in badge:
                badges[t] += 1
            if pos and neg:
                pairs[f"{neg[0]} / {pos[0]}"] += 1
            hooks[hook] += 1
            structures[structure] += 1

    corpus = {
        "files_with_ocr": n_ok,
        "structures": dict(structures.most_common()),
        "hooks": dict(hooks.most_common()),
        "button_labels_top": buttons.most_common(40),
        "button_pairs_top": pairs.most_common(30),
        "eyebrows_top": eyebrows.most_common(60),
        "badges_top": badges.most_common(30),
        "headlines_sample": headlines.most_common(120),
    }
    (out / "copy_corpus.json").write_text(json.dumps(corpus, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({k: corpus[k] for k in ("files_with_ocr", "structures", "hooks")}, ensure_ascii=False))
    print("button pairs:", pairs.most_common(12))
    print("eyebrows:", eyebrows.most_common(12))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
