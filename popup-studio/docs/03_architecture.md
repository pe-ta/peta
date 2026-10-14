# システム構成案 v0.1

- 作成日: 2026-10-14
- 前提: 社内ツール + クライアント向け承認ポータル。ZEALS 配信基盤とはファイル書き出し（将来 API）で連携。

---

## 1. 全体像

```
┌──────────────┐   ┌───────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ 1. Brief     │ → │ 2. Generate   │ → │ 3. Preflight │ → │ 4. Review &  │ → │ 5. Export &  │
│  構造化ブリーフ │   │  テンプレ+AI   │   │  規約/可読性/ │   │    Approve   │   │   Measure    │
│  LP抽出       │   │  PNG/GIF描画   │   │  表現/比較判定 │   │  実機プレビュー│   │  ZEALS仕様   │
│  仮説グリッド  │   │  自己批評ループ │   │              │   │  注釈/承認    │   │  成果取込/判定 │
└──────────────┘   └───────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
        ↑                                                                             │
        └───────────────────── 6. Learning Library（DNAタグ × 成果 → 推奨/事前分布）←──┘
```

## 2. コンポーネント

| レイヤ | 候補技術 | 選定理由 |
| --- | --- | --- |
| Web アプリ（社内 + 承認ポータル） | Next.js (TypeScript) + Tailwind | 既存リポジトリが HTML/CSS 資産中心。テンプレートも同じ言語で書ける。承認ポータルは同一アプリの公開ルート |
| API / ジョブ | Next.js Route Handlers + ジョブキュー（BullMQ / Cloud Tasks） | 生成・描画・GIF 変換は非同期ジョブ |
| DB | PostgreSQL（Supabase or Cloud SQL） | リレーショナル + JSONB（ブリーフ・DNA タグ） |
| ストレージ | GCS / S3 | 生成物・プレビュー・書き出し |
| 描画 | Playwright + Chromium（サーバー側） | テンプレート HTML を実寸撮影。GIF はフレーム撮影 → gifski/ffmpeg |
| LLM | Anthropic SDK（`@anthropic-ai/sdk`）。既定 `claude-opus-5-5`、大量処理は `claude-haiku-5-5` | 構造化出力、ビジョン、プロンプトキャッシュ |
| 画像生成 | Google（Nano Banana Pro）/ OpenAI（GPT Image 1.5）をアダプタで切替 | 権利・品質を比較し採用。アダプタ化で差し替え可能に |
| 認証 | Google Workspace SSO（社内）、署名付きリンク + メール OTP（クライアント） | クライアントにアカウント作成を強いない |
| 通知 | Slack / メール / LINE Notify 相当 | 承認リマインド |
| 分析 | Postgres + 軽量 BI（Metabase）→ 既存の Tableau/Redash と接続可 | ZEALS 既存の分析基盤に合わせる |

## 3. データモデル（主要エンティティ）

```
Client            クライアント。brand_kit(JSON: 色/ロゴ/フォント/NG語/トーン)、industry
Campaign          クライアント × 施策（LP URL、オファー、期間）
Brief             Campaign 配下。structured(JSON)、lp_snapshot、hypothesis_grid(JSON)
Template          HTML/CSS テンプレート。spec(JSON: 寸法/容量/GIF制約)、slots(JSON: 差込項目)、animation_presets
Creative          生成された 1 案。brief_id、template_id、slots_values(JSON)、hypothesis(text)、
                  dna_tags(JSON)、status(draft/reviewing/submitted/approved/rejected/live/ended)
CreativeVersion   Creative の版。png_url、gif_url、render_meta、preflight_result(JSON)、created_by
Review            社内/クライアントのレビュー。comments[]（座標付き注釈）、decision、reason_tags[]
Approval          承認証跡。approver、approved_at、version_id、method(portal/email/guardrail)
Experiment        同時配信セット。campaign_id、creative_ids[]、start/end、decision_rule(JSON)
Metric            日次 × creative_id: impressions、clicks、line_adds、bot_starts、conversions、blocks
Insight           学習ライブラリの集計結果（切り口 × 勝率 × リフト × 件数）
```

## 4. 生成パイプライン（1 ブリーフ → N 案）

1. **LP 抽出**: Playwright で LP をスクリーンショット + DOM テキスト抽出 → Claude（ビジョン + 構造化出力）で
   主要訴求・配色・ロゴ位置・既存オファーを JSON 化 → ブリーフ初期値。
2. **仮説展開**: ブリーフ + ブランドキット + 学習ライブラリの推奨 → Claude が仮説グリッドの各セルにコピー案（見出し/サブ/CTA）を生成。
   制約: 文字数、NG 語、業界要注意表現、トーン。構造化出力で `{headline, sub, cta, rationale, hypothesis}`。
3. **ビジュアル**: セルごとに (a) LP 既存素材のクロップ、(b) 生成画像、(c) テンプレート内蔵のグラフィック の 3 択。生成時は「文字を含めない」「人物は許諾素材のみ」等をプロンプト規約として固定。
4. **組版**: テンプレート HTML にスロット値を差し込み、Playwright で実寸描画 → PNG。
   GIF はアニメーションプリセット（登場/強調/ループ）を適用し、`N` フレーム撮影 → gifski → 容量上限に合わせて自動調整。
5. **自己批評（MIMO 型）**: 描画結果を Claude ビジョンに渡し、プリフライト観点（可読性・CTA 視認・ブランド整合・表現）で指摘 → 自動修正可能な項目（文字サイズ・改行位置・色）を修正して再描画。最大 2 ループ。
6. **プリフライト確定**: ルールベース（コントラスト計算、寸法、容量、NG 辞書）+ LLM 判定を統合して `preflight_result` に保存。

目標性能: PNG 1 案 ≤ 10 秒、GIF 1 案 ≤ 60 秒、12 案並列で 5 分以内（ジョブ並列度 4〜6）。

### LLM 実装上のメモ

- `@anthropic-ai/sdk` を使用。モデル既定は `claude-opus-5-5`、タグ付け・一次スクリーニングは `claude-haiku-5-5`。
- 思考は適応的（`thinking: {type: "adaptive"}`）、構造化出力は `output_config.format`。
- ブランドキット・テンプレート仕様・表現ルールはシステムプロンプトの**固定プレフィックス**に置き、`cache_control` でキャッシュ。ブリーフ固有情報は後ろに置く。
- 安全分類器による `stop_reason: "refusal"` を必ず処理し、サーバーサイドフォールバック（`fallbacks: "default"`）を有効化。医療・美容系の表現でまれに発生し得る。

## 5. 評価パイプライン（プリフライト）

| 評価器 | 方式 | 出力 |
| --- | --- | --- |
| 仕様 | 寸法・容量・形式・GIF フレーム/秒数の機械チェック | pass/fail + 自動修正 |
| 可読性 | 実寸での最小文字高さ（px→mm 換算）、WCAG コントラスト比、CTA タップ領域 ≥ 44px | 指摘 + 修正提案 |
| ブランド | 許容色距離（ΔE）、ロゴ最小サイズ、余白ルール、フォント | 指摘 |
| 表現 | NG 辞書 + Claude による文脈判定（景表法/薬機法系の要注意表現、誇大・断定） | 指摘 + 代替表現 |
| 注目 | サリエンシー推定（オープンソースモデル）で CTA/主訴求への注目を可視化 | ヒートマップ（参考） |
| 比較判定（Phase 3） | Claude ビジョンで 2 案ペアワイズ比較 + 理由。実績順位との一致（Kendall τ）を継続測定 | 「A が優勢（理由）」参考値 |

表示は「スコア + 指摘 + 改善提案」の構造で統一（zeals-short-video-ai の分析ページの型を踏襲する想定。要確認 Q7）。

## 6. 承認ポータル

- URL: `/review/<signed-token>`。期限付き、閲覧/承認権限を分離。
- 実機プレビュー: LP スクリーンショット上に実寸配置した PNG/GIF を iPhone/Android/PC フレームで表示。暗転オーバーレイと閉じるボタンも再現。
- 注釈: 画像上の座標ピン + コメント。差戻し時は理由タグ必須（ブランド/法務/訴求方向/好み/誤字/その他）。
- 承認: 案単位 / セット一括。承認証跡（誰・いつ・どの版）を保存し PDF 出力可。
- ガードレール承認（オプション）: クライアントが事前合意したテンプレート群・表現ルール内の新変種は、通知 + 48 時間の異議申立期間で自動承認。

## 7. 配信連携・計測

- 書き出し: ZEALS 入稿仕様に合わせた ZIP（PNG/GIF + `manifest.json`: creative_id、寸法、hypothesis、dna_tags、LINE 追加 URL パラメータ）。
- クリエイティブ ID をリンクパラメータ（例: `?zc=<creative_id>`）で引き継ぎ、LINE 追加〜CV を突合（配信基盤側の対応要確認 Q4）。
- 成果取込: CSV アップロード（Phase 2 初期）→ API（Phase 2 後半）。
- 判定: 各 creative の CTR / LINE 追加率 / CV 率を Beta 事後分布で推定し、「最良である確率」「期待損失」を算出。
  ルール例: 最良確率 ≥ 95% かつ 期待損失 < 0.1pt、または最小観測数到達 + タイムボックス満了で終了。
- 比率制御が可能なら Thompson Sampling で配信比率を日次更新（Phase 3）。

## 8. 学習ライブラリ

- DNA タグ付け: Claude（Haiku）で各案を `{appeal_axis, offer_type, layout_type, color_tone, has_person, motion, cta_type, industry}` に分類。過去案も一括インポート時に同じ処理。
- 集計: 切り口 × 指標の勝率・平均リフト・件数。件数が少ない切り口は非表示（n ≥ 5）。
- 推奨: 新ブリーフの業種・オファーに近い過去案（埋め込み類似）と、切り口別の勝率を仮説グリッドの各セルに表示。
- 事前分布: Phase 3 で、切り口別の実績を新変種の初期 Beta 事前分布に反映（コールドスタート短縮）。

## 9. セキュリティ・権利

- クライアントデータは `client_id` で行レベル分離。承認ポータルは署名トークン + 期限。
- 生成 AI へ送るデータから PII を除外（LP 抽出時にフォーム値等は破棄）。
- 画像生成は商用利用・学習オプトアウトが規約で明確なプロバイダのみ。生成元・プロンプト・モデルを `render_meta` に保存（権利トレーサビリティ）。
- フォントは商用ライセンス確認済みのみテンプレートに登録。

## 10. MVP の最小構成（Phase 1）

1. Client / Brief / Template / Creative / CreativeVersion / Review / Approval のみ実装。Experiment / Metric は Phase 2。
2. テンプレートは **2 型 × 2 サイズ**（例: 画像主体型・テキスト主体型 × スマホ縦・PC 横）から開始。アニメーションプリセット 3 種。
3. 画像生成は 1 プロバイダ（評価後に決定）。LP 既存素材のクロップを優先。
4. 承認ポータルは実機プレビュー・注釈・承認・リマインドまで。ガードレール承認は Phase 2。
5. 書き出しは ZIP + manifest。
