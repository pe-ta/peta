# Popup Lab — 勝ちポップアップ発見エンジン

ZEALS のチャットコマース（Web離脱時ポップアップ → LINE友だち追加 → チャットボット → CV）において、
**離脱ユーザーを LINE に連れてくる「勝ちポップアップ」を、どのクライアントでも 2 週間以内に見つけ、更新し続ける**ための社内プロダクト。

一文で: **ポップアップを「作って提出する成果物」から「勝つまで回す実験」に変える。**
（目的の選定経緯は [docs/05_positioning.md](docs/05_positioning.md)。参照モデルは CyberAgent 極予測AI のチャンピオン方式）

ループ: ブリーフ（仮説グリッド）→ 挑戦者候補を生成 → **辛口分析**でふるい → クライアント承認 → 配信 → 結果入力 → **ベイズ勝率判定** → チャンピオン昇格 → **学びログ** → 次の仮説

このディレクトリは **Next.js アプリ本体**と**要件定義ドキュメント**の両方を含みます（ディレクトリ名は Vercel の設定互換のため `popup-studio` のまま）。

| ドキュメント | 内容 |
| --- | --- |
| [docs/01_requirements.md](docs/01_requirements.md) | 要件定義書 v0.1（背景・現状分析・ゴール・スコープ・機能/非機能要件・KPI・リスク・確認事項） |
| [docs/02_research.md](docs/02_research.md) | 競合サービス・論文・生成AI技術の調査メモと、本プロダクトへの示唆 |
| [docs/03_architecture.md](docs/03_architecture.md) | システム構成案・データモデル・生成パイプライン・評価パイプライン・技術選定 |
| [docs/04_roadmap.md](docs/04_roadmap.md) | フェーズ計画（MVP → Phase 2 → Phase 3）と各フェーズの検証ポイント |
| [docs/05_positioning.md](docs/05_positioning.md) | 目的（ポジショニング）の検討。競合・海外プロダクトの「約束」比較と推奨 |
| [docs/06_qa.md](docs/06_qa.md) | QA レポート。見直しの観点、直したこと、確認結果、残っている弱点 |

## 実装済みの機能（v0.3）

| 工程 | 画面 / API | 内容 |
| --- | --- | --- |
| 実験ボード | `/` | クライアントごとの現行チャンピオン・挑戦中の案・確認待ち・今週の結論数（North Star）・ブリーフ→初配信の日数。全クライアントの学びログ |
| ブリーフ | `/briefs/new`、編集は `/briefs/[id]/edit` | 勝ちの定義（LINE追加率 / CTR / CVR）、構造化ブリーフ、LP URL からタイトル・OG画像・ブランド色候補を自動抽出。訴求軸 × ビジュアル × 動き の仮説グリッド |
| 辛口分析 | `/creatives/[id]`、一括は `/briefs/[id]` | Claude のビジョンで画像を見て 6 軸採点（注目・明確さ・文脈適合・CTA・信頼・表現の安全）+ ダメな理由 + 文言レベルの直し方。チャンピオンがいれば勝敗予測（ペアワイズ）。API キー未設定時はルール判定 |
| 実験 | `/briefs/[id]` | 承認済み案を「配信開始」で投入（最初の案がチャンピオン）。結果（表示・クリック・LINE追加・CV・ブロック）を入力すると Beta 分布で勝率を推定し、95% 以上で勝ち判定 → 昇格。負け / 結論なしで終了。結論は学びログに自動記録 |
| 生成 | `/briefs/[id]` | 訴求軸ごとに AI（Claude）でコピー生成し、テンプレート（HTML/CSS相当の JSX）に差し込んで複数案を一括生成。API キー未設定時はルールベース |
| 描画 | `/api/creatives/[id]/image?fmt=png\|gif` | Satori → resvg で PNG、アニメーション（ポップイン / スライドイン / CTA点滅）はフレーム撮影 → gifenc で GIF。日本語は Noto Sans JP で正確に描画 |
| プリフライト | `/creatives/[id]` | コントラスト比（WCAG）、文字数、最小文字サイズ、NGワード、要注意表現（景表法・薬機法系）、容量をチェックしスコア化。テキスト・配色・動きをその場で編集して再描画 |
| 承認 | `/review/[token]` | ログイン不要の署名付きリンク。スマホ/PC フレーム内で LP スクリーンショットに重ねた実機プレビュー。案ごとに承認 / 修正依頼（理由タグ + コメント） |
| 書き出し | `/api/briefs/[id]/export` | 承認済み案（なければ全案）を PNG/GIF + `manifest.json`（寸法・仮説・DNAタグ・計測用パラメータ）で ZIP 出力 |

未実装: 配信基盤からの成果データ自動取り込み（現在は手入力）、配信比率制御、DNA タグ × 成果の集計と推奨、辛口分析の実績校正（Kendall τ）。詳細は `docs/04_roadmap.md`。

## ローカルで動かす

```bash
cd popup-studio
npm install
cp .env.example .env.local   # 必要に応じて値を設定
npm run dev                   # http://localhost:3000
```

環境変数が無くても動きます（データはメモリ保持、コピーはルールベース）。

| 変数 | 用途 |
| --- | --- |
| `DATABASE_URL` | Postgres 接続文字列（Neon / Vercel Postgres）。未設定時はインメモリで、再起動・デプロイで消える |
| `ANTHROPIC_API_KEY` | コピー生成に Claude を使う。未設定時はルールベース |
| `REVIEW_SECRET` | クライアント承認リンクの署名用。本番では長いランダム文字列を設定 |
| `NEXT_PUBLIC_APP_URL` | 承認リンクをコピーする際のベース URL（例: `https://popup-studio.vercel.app`） |

検証コマンド: `npx tsc --noEmit && npx eslint src && npm run build`

## Vercel にデプロイする

1. Vercel で **Add New → Project** → この GitHub リポジトリ（`pe-ta/peta`）を Import。
2. **Root Directory** を `popup-studio` に設定（Framework Preset は Next.js が自動検出される）。
3. **Storage → Create Database → Neon (Postgres)** を追加してプロジェクトに接続すると `DATABASE_URL` が自動で入る。テーブルは初回アクセス時に自動作成。
4. **Settings → Environment Variables** に `ANTHROPIC_API_KEY`、`REVIEW_SECRET`、`NEXT_PUBLIC_APP_URL` を追加。
5. Deploy。以降はブランチへの push ごとにプレビュー URL が発行される。

注意:
- データベース未接続のままデプロイすると、サーバーレス関数ごとにメモリが分かれるため「生成した案が開けない」挙動になります。Neon の接続は必須です。
- 画像描画はフォント（約 4.7MB）をバンドルするため、初回のコールドスタートは数秒かかります。
- GIF 生成は 14 フレームで 1 案あたり 3〜6 秒。関数の `maxDuration` は 60 秒。

## ディレクトリ構成

```
popup-studio/
  docs/                     要件定義・調査・構成・ロードマップ
  src/app/                  画面と API（App Router）
    briefs/new, briefs/[id], creatives/[id], review/[token]
    api/creatives/[id]/image, api/briefs/[id]/export
  src/lib/
    types.ts                ドメイン型（Brief / Creative / Review / Critique / Learning）
    store.ts                ドキュメントストア（Memory / Postgres 自動切替）
    templates/index.tsx     テンプレート（画像主体型・テキスト主体型）とアニメーション
    render.ts               Satori → resvg → PNG / GIF
    ai.ts                   Claude によるコピー生成 + ルールベースのフォールバック
    critique.ts             辛口分析（Claude ビジョン + ルール判定フォールバック）
    stats.ts                ベイズ勝率判定（Beta-Binomial, Monte Carlo）、リードタイム
    preflight.ts            コントラスト・文字数・NG・要注意表現・容量チェック
    lp-extract.ts           LP からタイトル・OG画像・ブランド色を抽出
    actions.ts              Server Actions（作成・編集・提出・承認）
    review-token.ts         署名付き承認リンク
  src/components/           UI 部品（カード・プリフライト・実機プレビュー）
```

## ステータス

- 2026-10-14: 要件定義ドラフト v0.1。MVP の縦一本（ブリーフ → 生成 → プリフライト → 承認 → 書き出し）を実装し、Vercel + Neon で本番稼働。
- 2026-10-14: 目的を「勝ちポップアップ発見エンジン」に確定（v0.2）。実験ボード・辛口分析・配信/結果/勝率判定/昇格・学びログを追加。
- 2026-10-14: 品質見直し（v0.3）。生成物の配色補正・クーポン型追加・「次にやること」導線・操作結果の通知・CDN キャッシュ・サーバー側ガード。詳細は `docs/06_qa.md`。
