# Popup Studio（仮称）— 離脱時ポップアップ検証速度 3x プロジェクト

ZEALS のチャットコマース（Web離脱時ポップアップ → LINE友だち追加 → チャットボット → CV / LINE PUSH配信 → CV）における
**ポップアップクリエイティブの「仮説→制作→承認→配信→学習」ループを 3 倍速で回す**ための社内プロダクト。

このディレクトリは **Next.js アプリ本体**と**要件定義ドキュメント**の両方を含みます。

| ドキュメント | 内容 |
| --- | --- |
| [docs/01_requirements.md](docs/01_requirements.md) | 要件定義書 v0.1（背景・現状分析・ゴール・スコープ・機能/非機能要件・KPI・リスク・確認事項） |
| [docs/02_research.md](docs/02_research.md) | 競合サービス・論文・生成AI技術の調査メモと、本プロダクトへの示唆 |
| [docs/03_architecture.md](docs/03_architecture.md) | システム構成案・データモデル・生成パイプライン・評価パイプライン・技術選定 |
| [docs/04_roadmap.md](docs/04_roadmap.md) | フェーズ計画（MVP → Phase 2 → Phase 3）と各フェーズの検証ポイント |

## MVP（Phase 1）で実装済みの機能

| 工程 | 画面 / API | 内容 |
| --- | --- | --- |
| ブリーフ | `/briefs/new` | 構造化ブリーフ入力。LP URL からタイトル・OG画像・ブランド色候補を自動抽出。訴求軸 × ビジュアル × 動き の仮説グリッド |
| 生成 | `/briefs/[id]` | 訴求軸ごとに AI（Claude）でコピー生成し、テンプレート（HTML/CSS相当の JSX）に差し込んで複数案を一括生成。API キー未設定時はルールベース |
| 描画 | `/api/creatives/[id]/image?fmt=png\|gif` | Satori → resvg で PNG、アニメーション（ポップイン / スライドイン / CTA点滅）はフレーム撮影 → gifenc で GIF。日本語は Noto Sans JP で正確に描画 |
| プリフライト | `/creatives/[id]` | コントラスト比（WCAG）、文字数、最小文字サイズ、NGワード、要注意表現（景表法・薬機法系）、容量をチェックしスコア化。テキスト・配色・動きをその場で編集して再描画 |
| 承認 | `/review/[token]` | ログイン不要の署名付きリンク。スマホ/PC フレーム内で LP スクリーンショットに重ねた実機プレビュー。案ごとに承認 / 修正依頼（理由タグ + コメント） |
| 書き出し | `/api/briefs/[id]/export` | 承認済み案（なければ全案）を PNG/GIF + `manifest.json`（寸法・仮説・DNAタグ・計測用パラメータ）で ZIP 出力 |

Phase 2（成果データ取り込み・ベイズ判定）と Phase 3（学習ライブラリ・ペアワイズ比較判定）は未実装。詳細は `docs/04_roadmap.md`。

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
    types.ts                ドメイン型（Brief / Creative / Review / Preflight）
    store.ts                ドキュメントストア（Memory / Postgres 自動切替）
    templates/index.tsx     テンプレート（画像主体型・テキスト主体型）とアニメーション
    render.ts               Satori → resvg → PNG / GIF
    ai.ts                   Claude によるコピー生成 + ルールベースのフォールバック
    preflight.ts            コントラスト・文字数・NG・要注意表現・容量チェック
    lp-extract.ts           LP からタイトル・OG画像・ブランド色を抽出
    actions.ts              Server Actions（作成・編集・提出・承認）
    review-token.ts         署名付き承認リンク
  src/components/           UI 部品（カード・プリフライト・実機プレビュー）
```

## ステータス

- 2026-10-14: 要件定義ドラフト v0.1。MVP の縦一本（ブリーフ → 生成 → プリフライト → 承認 → 書き出し）を実装し、ローカルで E2E 確認済み。
