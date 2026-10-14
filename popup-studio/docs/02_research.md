# 調査メモ: 競合・論文・生成 AI 技術と本プロダクトへの示唆

- 作成日: 2026-10-14
- 注意: Web 検索ベースの二次情報を含む。価格・機能は各公式サイトで再確認すること。
  論文は arXiv 番号を記載。本環境からは arXiv 本文の直接取得ができなかったため、要旨はアブストラクト/要約の範囲。

---

## 1. 直接競合（離脱防止ポップアップ → LINE → チャットボット）

| サービス | 概要 | 本プロダクトへの示唆 |
| --- | --- | --- |
| **Penglue（ペングル）** | 離脱タイミングを AI 予測しポップアップ → LINE 誘導 → チャットボット接客。初期・月額 0 円の完全成果報酬をうたう。CV 未達ユーザーに PUSH で再アプローチ | ZEALS と同一モデルの競合。公開情報ではクリエイティブ制作の高速化や学習ライブラリの訴求はない。**「クリエイティブ検証速度」は差別化余地** |
| LINE 公式アカウント標準機能 | 友だち追加バナーのポップアップ表示機能あり。一部端末で非表示になる制約 | 端末依存の表示制約があるため、実機プレビューで端末別確認が必要 |
| L-TRACK 等 | LINE ログイン認証画面のスキップで友だち追加率 1.5 倍（ベンダー自社調べ） | ポップアップ後の摩擦（認証画面）も検証対象。クリエイティブ ID をパラメータで引き継ぐ設計が必要 |

出典: [PRONI アイミツ Penglue](https://saas.imitsu.jp/cate-line-marketing-tool/service/3353)、
[Penglue 公式](https://penglue.jp/)、[Penglue ブログ: 離脱防止ポップアップ](https://penglue.jp/blog/anti-disengagement-pop-up/)、
[CCI 資料（LINE ポップアップ制約）](https://www.cci.co.jp/wp-content/uploads/2023/06/CCI_KNOTBOX2-1.pdf)、
[L-TRACK リリース](https://zaikei.co.jp/releases/3013216/)

## 2. ポップアップ / CRO ツール（海外）

| サービス | AI / テスト機能 | 示唆 |
| --- | --- | --- |
| **OptiMonk** | AI ポップアップ生成、300+ テンプレート、A/B テスト。全ポップアップ平均 CVR 11.09%（自社データ） | テンプレート × AI 文言の組み合わせが標準化している |
| **Wisepops** | 行動 AI ターゲティング、AI がテスト設定と結果要約。平均 CVR 4.82%、離脱意図型 3.94%、上位 10% は 57.7% | 「AI がテストを設計し、結果を要約する」が UX の到達点 |
| **Alia** | Smart Testing: デザイン・コード不要で A/B テストを自動生成・実行 | 変種生成とテストを一体化 |
| **Popupsmart** | テキスト 1 プロンプトからポップアップ生成。1 万キャンペーン平均 CVR 3.49% | 入力は「プロンプト」より構造化ブリーフの方が再現性が高い（本プロダクトの選択） |
| **Claspo** | 最大 5 変種、内容・タイミング・トリガーを比較 | タイミングとトリガーも仮説軸 |
| Justuno | AI Smart Timing（表示タイミング最適化） | — |

ベンチマーク上の注意: ベンダー間で定義（分母・対象タイプ・外れ値処理）が異なるため、
**自社ベースラインを Phase 0 で測る**ことが先。モバイル最適化キャンペーンはデスクトップ比 +38%（Flint）という報告もあるが離脱意図限定か不明。

出典: [VWO 比較](https://vwo.com/blog/exit-intent-popup-tools/)、[Claspo 比較](https://claspo.io/blog/best-exit-intent-popup-software/)、
[Popupsmart: AI popup tools](https://popupsmart.com/blog/ai-popup-tools)、[Popupsmart ベンチマーク](https://popupsmart.com/blog/popup-conversion-benchmark-report)、
[CrazyEgg 統計](https://www.crazyegg.com/blog/popup-statistics/)、[Flint 統計](https://www.flint.com/blog/exit-intent-popup-conversion-statistics)

## 3. 広告クリエイティブ生成・スコアリング（海外 / 国内）

| サービス | 特徴 | 示唆 |
| --- | --- | --- |
| **Pencil** | EC 広告実績で学習したスコアリング。Meta/TikTok 中心 | 「生成 + 事前スコア」が標準。スコアは自社ドメインのデータで学習しないと当たらない |
| **AdCreative.ai** | テンプレート型の大量生成 + パフォーマンス予測 | 量産 UX の参考 |
| **Omneky** | Brand LLM でブランドボイス一貫性。マネージドサービス | ブランドキットを LLM 制約として持つ |
| **Creatopy（The Brief）** | 多フォーマット展開、フィード連動パーソナライズ、配信 | テンプレート → 多サイズ自動展開 |
| **Celtra** | エンタープライズ向けクリエイティブオートメーション。高価格・導入複雑 | テンプレート + データ差し込みの王道。小さく作る |
| **Meta Advantage+ Creative** | 画像拡張、背景生成、コピー変種、Brand Memory（2026 Cannes 発表、パイロット） | プラットフォーム側が生成を内製化する流れ。**ZEALS 固有ファネル（LINE → CV）のデータが差別化** |
| **Google Asset Studio / PMax** | Gemini ベースの素材生成、ワンクリック A/B、Veo での動画化 | — |
| 国内: Tasky、アド.com、Canva AI、Adobe Firefly | Tasky は URL 入力で生成（月額 9,800 円〜）。Firefly は権利面の安全性で評価 | **LP URL からの自動抽出**は国内でも一般化。権利が明確なモデル選定が必須 |

出典: [SuperScale 比較](https://superscale.ai/compare/best-ai-ad-creative-tools)、[Rocketium: Pencil 代替](https://rocketium.ai/academy/all/pencil-ai-alternatives)、
[AdLibrary 比較](https://adlibrary.com/posts/automated-ad-creation-platforms-compared)、[Segwise: PMax 生成](https://segwise.ai/blog/performance-max-ai-asset-generation.md)、
[Adtaxi: Meta 2026](https://www.adtaxi.com/?p=12137)、[japan-ai バナー AI 7 選](https://japan-ai.co.jp/media/413/)、[Tasky 比較](https://lp.tasky-ai.com/blog/ai-banner-creation)

## 4. 論文（設計判断に直結するもの）

### 4.1 バナー自動デザイン: 「編集可能な構造」で生成する

- **BannerAgency**（Sony, EMNLP 2025, arXiv 2503.11060）: マルチモーダル LLM エージェント（Strategist / Background Designer / Foreground Designer / Developer）が、
  背景は画像生成、前景（テキスト・ロゴ・CTA）はレイアウト指示として生成し、**編集可能なコンポーネントとして組み立てる**。
  拡散モデルの一発画像生成は編集不能で実務に乗らない、という問題設定。BannerRequest400 ベンチマークを公開。
- **MIMO: Mirror in the Model**（EMNLP 2025 Industry）: 生成 → 自己批評（リフレクション）→ 修正のループで、実務シナリオの品質を改善。
- **PRISM**（arXiv 2601.11747）: データからデザイン知識を学習してスタイル改善。

→ **示唆**: 本プロダクトの生成は「HTML/CSS テンプレート（前景）+ 生成/既存画像（背景）」の二層構造にする（FR-GEN-01/02）。
生成後に MLLM で自己批評し、プリフライトの指摘を自動修正する（MIMO 型ループ）。

出典: [BannerAgency GitHub](https://github.com/sony/BannerAgency)、[ACL Anthology](https://aclanthology.org/2025.emnlp-main.214/)、[プロジェクトページ](https://banneragency.github.io/)、
[MIMO (ResearchGate)](https://www.researchgate.net/publication/393477663_Mirror_in_the_Model_Ad_Banner_Image_Generation_via_Reflective_Multi-LLM_and_Multi-modal_Agents)

### 4.2 クリエイティブの事前評価: 「絶対スコア」より「ペアワイズ比較 + 理由」

- **Creative4U**（arXiv 2508.12628, 2025）: MLLM が 2 つの広告画像を比較し、どちらがクリックされやすいかを理由付きで判定。
  オフラインでバンディット/ランキングのベースラインを上回り、オンラインで CTR 最大 +7.07%（著者報告）。
- **CTR-Driven Advertising Image Generation with MLLMs**（arXiv 2502.06823, 2025）: MLLM 報酬モデルでペアワイズ比較と絶対 CTR を予測、生成を CTR 方向に最適化。オンラインで +7.4%（著者報告）。
- **IDProxy**（Xiaohongshu, arXiv 2603.01590, 2026）/ **LLM-HYPER**（arXiv 2604.12096, 2026）: コールドスタート（配信実績のない新クリエイティブ）の CTR 予測に MLLM を使う。**新しい変種の初期配分**に使える考え方。
- **PinDCO**（Pinterest, arXiv 2609.11943, 2026）: ページ全体を考慮した動的クリエイティブ最適化。

→ **示唆**: FR-EVAL-06 は「2 案比較 + 理由」の形式にする。絶対スコアは解釈されすぎて誤用されやすい。
自社の配信実績で校正（Kendall τ などで実績順位との一致を測る）してから本番表示する。

出典: [Creative4U 要約](https://pith.science/paper/2508.12628)、[CTR-Driven 要約](https://pith.science/paper/2502.06823)、
[IDProxy](https://arxiv.org/html/2603.01590v1)、[LLM-HYPER](https://arxiv.org/abs/2604.12096)、[PinDCO](https://arxiv.org/pdf/2609.11943)

### 4.3 合成オーディエンス（ペルソナ LLM）は過信しない

- **Do Synthetic Personas Predict Real Audience Response?**（arXiv 2609.25010, 2026）: ペルソナ付与した LLM パネルより、
  **ペルソナなしのベースライン**の方が広告コピー変種の実績順位と一致した（Kendall τ 0.361 vs 0.084）。
- ペルソナ研究のレビュー（arXiv 2512.00461 など）も、ペルソナは文体を変えるが数値判断はあまり変えない・再現性に課題と指摘。

→ **示唆**: 「架空ユーザー 100 人に見せて予測」型の機能は作らない。評価はペアワイズ比較 + ルールベース + 実績校正に限定する。

出典: [arXiv 2609.25010](https://arxiv.org/html/2609.25010)、[arXiv 2512.00461](https://arxiv.org/pdf/2512.00461)

### 4.4 実験設計: 少トラフィックで速く安全に結論を出す

- **Always Valid Inference**（Johari, Pekelis, Walsh, arXiv 1512.04922）: 途中で何度見ても誤検出率が壊れない逐次検定（mSPRT）。
- **Comparison Lift**（arXiv 2009.07899）: 文脈付き Thompson Sampling で弱い変種から早期に配信を減らし、テストコストを下げる広告主向けシステム。
- **AutoCO**（WWW 2021, arXiv 2103.00436）: FM（因子分解機）CTR モデル + Thompson Sampling でクリエイティブ探索、オンライン CTR +7%。

→ **示唆**: FR-EXP-04 はベイズ推定（勝つ確率・期待損失）+ 最小観測数 + タイムボックスの三点セット。
配信比率制御が可能なら Thompson Sampling（FR-EXP-05）。クライアント横断の学習ライブラリを事前分布として使うと少トラフィックでも収束が早まる。

出典: [Always Valid Inference](https://arxiv.org/abs/1512.04922v2)、[Comparison Lift](https://arxiv.org/pdf/2009.07899)、[AutoCO](https://ar5iv.labs.arxiv.org/html/2103.00436)

### 4.5 視線予測（サリエンシー）

- ベンダー（RealEye 93.9%、Memorable 97% など）の精度主張は自己申告で比較不能。
- 学術側（University of Turku）は「トップダウン課題では AI サリエンシーは実測アイトラッキングを代替できない」と指摘。

→ **示唆**: FR-EVAL-05 は「CTA に注目が集まっているか」の **可視化と注意喚起**に留め、スコア化・順位付けには使わない。

出典: [RealEye Predictor](https://predictor.realeye.io/)、[Turku 研究](https://research.utu.fi/converis/portal/detail/Publication/484273459?lang=en_US)

## 5. 生成 AI 技術の選定メモ

### 5.1 画像生成（背景・ヒーロー用）

| モデル | 日本語文字 | 解像度 | 概算単価 | 備考 |
| --- | --- | --- | --- | --- |
| Google Nano Banana Pro（Gemini 3 Pro Image） | 良（漢字・かな OK の報告） | 〜8.3MP/4K | 約 $0.14/枚 | 高密度テキスト・レイアウトに強いとの評価 |
| OpenAI GPT Image 1.5 | 良 | 〜1.5MP | $0.009〜0.133 | ポスター/マーケ素材の可読性で高評価 |
| FLUX.2 [max] / Kontext | 文字は劣る | 4MP | 約 $0.04 | 文字をぼかし部に幻覚する報告 |
| Adobe Firefly | — | — | — | 学習データの権利が明確。商用安全性で国内評価が高い |

→ **方針**: 文字は HTML レイヤーで描くため、画像モデルの文字能力は「画像内に文字が混入しないこと」の方が重要。
背景・商品・人物の品質と**商用利用条件・権利補償**で選ぶ。まず Nano Banana Pro と GPT Image 1.5 を並走評価し、クライアント業種（医療・美容）の表現制約に合うものを採用。

出典: [getimg.ai 比較](https://getimg.ai/blog/gpt-image-15-vs-nano-banana-pro-comparison-which-ai-image-model-is-better)、[VidGuru 10 テスト（日本語含む）](https://www.vidguru.ai/blog/nano-banana-pro-vs-gpt-image-1-5-comparison.html)、
[Overchat 比較](https://overchat.ai/ai-hub/ultimate-ai-image-generator-showdown)、[Tigris: Flux vs Nano Banana](https://www.tigrisdata.com/blog/flux-kontext-vs-nano-banana/)

### 5.2 LLM（コピー生成・ブリーフ抽出・表現チェック・ペアワイズ判定）

- 標準: Claude Opus 5.5（`claude-opus-5-5`、入力 $4 / 出力 $20 per MTok、適応的思考）。コピー生成・ブリーフ抽出・比較判定など判断品質が要る処理に使う。
- 大量・低コスト処理（タグ付け、NG ワード一次スクリーニング）: Claude Haiku 5.5（`claude-haiku-5-5`、$0.10 / $0.50）。
- 構造化出力（`output_config.format`）で JSON を強制し、プロンプトキャッシュでブランドキット・規約・テンプレート仕様を固定プレフィックス化してコストを下げる。
- 画像入力（ビジョン）でプレビュー画像を渡し、プリフライトの指摘と自己批評ループ（MIMO 型）を回す。

### 5.3 レンダリング（PNG / GIF）

- ヘッドレス Chromium（Playwright）でテンプレート HTML を実寸撮影 → PNG。
- GIF: CSS アニメーションを一定間隔でフレーム撮影 → `gifski`（高品質パレット）または `ffmpeg` palettegen/paletteuse で変換。
  フレーム数・ディザ・ループを ZEALS 仕様に合わせて自動最適化（容量上限に合わせて二分探索）。
- 将来、配信基盤が HTML/Lottie/WebP アニメを受け付けるなら GIF より小容量・高画質になる（確認事項 Q2 に追記）。

## 6. 承認ワークフロー（プルーフィングツール）の知見

- Ziflow / Filestage: 注釈付きレビュー、段階承認、期限。Ziflow 顧客事例で校正ラウンドが 3〜4 回 → 1.6 回（単一事例、ベンダー報告）。
- 共通点: **メール添付をやめ、1 つの URL 上で注釈と承認を完結させる**ことがラウンド削減の主因。

→ **示唆**: FR-APR-02〜04 は専用ツール連携でなく内製（実機プレビューと LINE/Slack リマインドが差別化）。差戻し理由のタグ化（FR-APR-07）は他ツールにない学習要素。

出典: [yespress: Ziflow](https://yespress.io/ziflow)、[Ziflow vs Filestage](https://www.ziflow.com/blog/ziflow-vs-filestage)、[toolradar 比較](https://toolradar.com/compare/filestage-vs-ziflow)

## 7. まとめ: ZEALS が取るべきポジション

1. **汎用バナー AI と競わない。** ポップアップ → LINE → ボット → CV という ZEALS 固有のファネル全体の成果データで学習するクローズドループが差別化。
2. **生成は編集可能な構造で**（BannerAgency 型）。デザイナーの監修コストを最小化し、ブランド整合性を担保。
3. **評価は比較 + 理由 + 実績校正**（Creative4U 型）。ペルソナ疑似パネルやサリエンシーの絶対スコアには依存しない。
4. **ボトルネックは承認。** 実機プレビュー + 注釈 + セット承認 + ガードレール運用で往復を半減させる。
5. **検証は並列 + 逐次判定。** 変種を同時に走らせ、統一ルールで早期終了し、学習ライブラリで次の事前分布を強化する。
