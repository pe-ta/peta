#!/bin/sh
# 4ペイン（HTML/CSS/JS Head/JS Body）を結合して確認用の preview.html を作る
cd "$(dirname "$0")"
{
  echo '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="robots" content="noindex,nofollow"><title>タイプ選択LP プレビュー</title>'
  echo '<style>body{margin:0;background:#fff}.lp-d{max-width:480px;margin:0 auto}</style><style>'
  : # CSS は 3_js_head.html から差し込む
  echo '</style>'
  cat 3_js_head.html
  echo '</head><body>'
  cat 1_html.html
  cat 4_js_body.html
  echo '</body></html>'
} > preview.html
