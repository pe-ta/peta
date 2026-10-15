#!/usr/bin/env python3
"""Build the in-app reference library from the inventory + OCR tags.

Usage:
  python3 -I library.py --inventory <out dir with tags.jsonl> --out popup-studio/data/library.json

Each entry carries text metadata only (no image bytes): client, inferred industry,
hook, structure, eyebrow, headline, buttons, badges, spec, animation. The app uses
it for "past similar cases" and as few-shot examples for copy generation.
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path

INDUSTRY_RULES: list[tuple[str, re.Pattern[str]]] = [
    ("美容・医療", re.compile(r"クリニック|美容|脱毛|AGA|歯科|デンタル|医療|整形|皮膚|レーザー|矯正|ピル|メンズ|ゴリラ|レジーナ|SBC|品川|湘南美容|TCB|アートネイチャー|ホワイトニング")),
    ("健康食品・サプリ", re.compile(r"サプリ|サジー|青汁|ビオフェルミン|ふりかけ|ピューレ|プロテイン|健康|乳酸菌|nosh|ナッシュ|宅配食|ZENB|食材|オイシックス|大地を守る会")),
    ("化粧品", re.compile(r"化粧|コスメ|スキンケア|美白|アスタリフト|POLA|ポーラ|LANCOME|ランコム|オルビス|SHIRORU|クレンズ|シャンプー|ヘアケア|KINUI|Rintosull|毛穴")),
    ("金融・保険", re.compile(r"銀行|証券|保険|生命|カード|ローン|FX|投資|NISA|共済|信金|BANK|MUFG|三井住友|PayPay|ニコス|アコム|みずほ|りそな|SBI|オリックス|Chakin|口座|年金|カテエネ")),
    ("不動産", re.compile(r"不動産|住宅|ハウス|リノベ|マンション|物件|リバブル|ホームズ|HOME|オープンハウス|積水|投資用|売却|査定")),
    ("教育・スクール", re.compile(r"塾|学院|ゼミ|英会話|スクール|講座|通信教育|Z会|進研|CPA|会計|資格|パスポート|AEON|イーオン|ECC|ITTO|明光|森塾|Gaba|ベルリッツ|受験|学習|セミナー|USCPA|簿記|TAC")),
    ("人材", re.compile(r"転職|求人|エージェント|採用|キャリア|バイト|派遣|Geekly|CPASS|カイゴジョブ|Omakase|副業")),
    ("フィットネス・美容サロン", re.compile(r"ジム|ヨガ|LAVA|ピラティス|フィットネス|カーブス|エステ|サロン|ネイル|まつ毛|BEYOND|b-monster|CALDO|パーソナル|ダイエット")),
    ("EC・通販", re.compile(r"通販|ストア|ショップ|EC|Amazon|楽天|アイロボット|ルンバ|パソコン|mouse|docomo|ahamo|スマホ|WiMAX|BIGLOBE|タイヤ|mobox|ブリヂストン|スーツ|ワイン|ENOTECA|TENGA|ペット|犬猫")),
    ("インフラ・生活", re.compile(r"ガス|電気|電力|太陽光|蓄電池|水|ウォーター|引越|引っ越し|カーセブン|中古車|保証")),
]


def industry_of(client: str) -> str:
    for name, rx in INDUSTRY_RULES:
        if rx.search(client):
            return name
    return "その他"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--inventory", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    inv = Path(args.inventory)
    entries = []
    for line in (inv / "tags.jsonl").open(encoding="utf-8"):
        t = json.loads(line)
        if t.get("structure") == "no_button_detected" and not t.get("headline"):
            continue  # nothing usable was read from the image
        headline = t.get("headline") or ""
        if len(headline) < 4 or len(headline) > 60 or headline.startswith(("※", "*", "＊")):
            continue
        client = t.get("client") or ""
        # Drive ids were prefixed as "<id>__" when files were saved; a title with its own "__" keeps one.
        client = re.sub(r"^(?:[A-Za-z0-9_-]*__)+", "", client)
        entries.append({
            "id": t["name"].split("__", 1)[0][:12],
            "client": client,
            "job": t.get("job") or "",
            "industry": industry_of(f"{client} {headline}"),
            "hook": t.get("hook") or "other",
            "structure": t.get("structure"),
            "eyebrow": t.get("eyebrow") or "",
            "headline": headline,
            "positive": (t.get("positive") or [None])[0],
            "negative": (t.get("negative") or [None])[0],
            "options": t.get("buttons") if t.get("structure") == "multi_choice" else None,
            "badges": t.get("badges") or [],
            "spec": t.get("spec"),
            "animated": bool(t.get("animated")),
            "cluster": t.get("cluster"),
            "tags": t.get("hook_all") or [],
        })
    # Keep one entry per (client, headline) so series of near-duplicates don't crowd the results.
    seen = set()
    unique = []
    for e in entries:
        key = (e["client"], e["headline"][:20])
        if key in seen:
            continue
        seen.add(key)
        unique.append(e)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at": __import__("datetime").date.today().isoformat(),
        "source": "ZEALS過去クリエイティブ格納フォルダ (popup)",
        "count": len(unique),
        "industries": dict(Counter(e["industry"] for e in unique).most_common()),
        "hooks": dict(Counter(e["hook"] for e in unique).most_common()),
        "entries": unique,
    }
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({k: payload[k] for k in ("count", "industries", "hooks")}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
