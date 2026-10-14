# ブラウザ E2E

本番ビルドを `PORT=3100 npm start` で起動した状態で実行する。Playwright と Chromium が必要。

```bash
npm i -D playwright            # 初回のみ
node e2e/loop.mjs              # 実験ループ全体
node e2e/flow.mjs              # 制作フロー（生成→編集→提出→承認→ZIP）
node e2e/visual.mjs            # 3 レイアウトの PNG 出力と導線の確認
```

各スクリプトはスクリーンショットと生成画像を `out*/` に保存する（git 管理外）。
`BASE=https://...` を指定すると本番 URL に対して実行できる。
