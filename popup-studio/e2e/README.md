# テスト

## 単体テスト（サーバー不要）

結果取り込み（日付・CSV 分割・列判定）、仮説の状態算出、逐次検定（A/A シミュレーションで誤判定率を確認）、同時期比較、おすすめ、週次集計を検証する。

```bash
node --import ./e2e/ts-loader.mjs --experimental-transform-types e2e/unit.test.ts
```

## ブラウザ E2E

本番ビルドを起動した状態で実行する。Playwright と Chromium が必要（`CHROME_PATH` で Chromium の実行ファイルを指定できる）。本番と同じ構成で確かめるため、Postgres を使うことを推奨する。

```bash
npm i -D playwright            # 初回のみ
npm run build
DATABASE_URL="postgres://user:pass@127.0.0.1:5432/popuplab" REVIEW_SECRET=local-secret PORT=3100 npm start

node e2e/ops.mjs               # 実験運用の一気通貫（仮説 → 承認 → 配信 → CSV 取り込み → 昇格 → 仮説が結論済み）
node e2e/loop.mjs              # 実験ループ（結果の手入力 → 昇格 → 学びログ）
node e2e/flow.mjs              # 制作フロー（編集 → プリフライト → 提出 → 承認 → ZIP → 不正トークン）
node e2e/visual.mjs            # 淡い色の補正・空提出のエラー・ブリーフ編集
node e2e/photo.mjs             # 写真セルの生成件数と編集画面でのレイアウト切替（OG 画像を返す LP を :3200 で用意）
node e2e/mobile.mjs            # 390px 幅での横はみ出しと承認ボタンのタップ領域
node e2e/v06.mjs               # おすすめ仮説 → 配信 → 複数日の CSV → 同時期比較・逐次検定・推移グラフ → レポート（署名の取り違え不可、390px）→ 週次グラフ
```

失敗時は終了コード 1 で終わる。スクリーンショットと生成画像は `out*/` に保存される（git 管理外）。
`BASE=https://...` を指定すると本番 URL に対して実行できる（データが作られる点に注意）。
