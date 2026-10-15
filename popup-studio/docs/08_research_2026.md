# 08. 最新研究・オープンソース調査（2026-10）

Popup Lab（勝ちポップアップ発見エンジン）に取り込めそうな論文・OSS を、用途別に整理する。
判断の軸は 3 つ: (a) 1,195 枚の過去資産と組み合わせて効くか、(b) 商用利用できるライセンスか、(c) 現状の構成（Next.js + Satori + LLM API）に無理なく載るか。

## 1. 勝ち負けの予測・比較（辛口分析の精度向上）

| 研究 | 要点 | 活かし方 | 制約 |
|---|---|---|---|
| **Creative4U**（arXiv 2508.12628, 2025） | 同一商品の 2 クリエイティブを MLLM に比較推論させ CTR の高い方を選ぶ。約 1 万ペア（CTR 差 60% 以上）で学習、ペア精度 0.79、オンラインで CTR +3〜7% | 辛口分析を「絶対採点」から「チャンピオンとの比較推論」に寄せる。比較プロンプトの構造（差分 → 理由 → 判定）をそのまま採用できる | 学習データは EC 画像。ポップアップでの較正は自前の実績が必要 |
| **CTR-Driven Advertising Image Generation**（WWW 2025, JD） | MLLM を報酬モデル化し、ペア比較で CTR を予測。ペア精度 58.6%、A/B で CTR +2% | 実績 CSV が揃った段階で、ZEALS 版ペア比較モデルを微調整する設計の雛形 | ペア精度 6 割弱。単体では決定打にならず、実 A/B と併用が前提 |
| **PosterReward**（CVPR 2026, MeiGen-AI） | 7 万件のポスター選好データで、全体美観に加えてタイポグラフィとレイアウトを採点する報酬モデル。コード公開 | 文字の読みやすさ・余白・整列といった「デザイン品質」軸のスコアを辛口分析に追加する | ポスター向け学習。縦型 900×1265 への適合は要検証 |
| **A³: Advertising Aesthetic Assessment**（CVPR 2026） | 3 万枚の広告画像に「注意 → 興味 → 欲求」の 3 段階で多次元ラベルと根拠文を付与。モデル・データ公開 | 採点軸を AIDA 準拠の 3 段階に整理し直す根拠になる。根拠文つきデータは「ダメな理由・直し方」生成の教師データとして使える | 中国語圏の広告が中心 |
| **Multimodal RewardBench 2**（2025） | CLIP 系の報酬モデル（ImageReward、HPSv3）は MLLM 判定より劣る。判定モデルは画像入りの回答を好むバイアスあり | 汎用の美観スコアを足すより、MLLM 比較判定 + 実績較正に集中する判断の裏付け | |

結論: 辛口分析は「チャンピオンとの比較判定」を主軸にし、PosterReward 系のデザイン品質軸を補助スコアとして足す。実績データが来たら Creative4U 方式でペア較正する。

## 2. 構造・レイアウト生成（テンプレートの自動化）

| 研究 / OSS | 要点 | 活かし方 |
|---|---|---|
| **BannerAgency**（Sony, EMNLP 2025, MIT ライセンス） | 戦略 → 背景 → 前景 → 実装の 4 エージェントで「編集可能な」バナーを生成。BannerRequest400 ベンチマーク公開 | 今の「ブリーフ → コピー → テンプレート描画」を、戦略（フック選択）と前景設計（スロット配置）に分ける構成の参考。編集可能性を保つ設計思想は Satori 方式と相性が良い |
| **Content-Aware Ad Banner Layout with Two-Stage CoT**（2025, 日本の研究グループ） | VLM が背景画像を読んで配置計画を文章で書き、HTML でレイアウトを出力 | 写真素材を使う案で、人物・商品に文字が被らない配置を自動化できる。HTML 出力なので Satori の JSX に直結する |
| **PosterLLaVA / PosterLlama**（2024, TMM 2026） | MLLM によるレイアウト生成。バナー 7k 件を含む学習データ | 自前の 1,066 枚からレイアウト（スロット座標）を抽出して微調整すれば、ZEALS 専用のレイアウト生成器になる |
| **OpenCOLE / Crello**（CyberAgent, CVPRW 2024） | 公開データのみで再現したデザイン生成。Crello データセットは CDLA-Permissive-2.0 | 国内発で日本語資料が多い。ベクターのレイヤー構造データの形式を、過去資産のタグ付けフォーマットの参考にする |

結論: 当面は手書きテンプレート 4 種で十分。写真案の自動配置（Two-Stage CoT）だけ早めに試す価値がある。

## 3. 注意・視線の予測（見出しとボタンが見られるかの事前チェック）

| 研究 / OSS | 要点 | 活かし方 |
|---|---|---|
| **Attend to Anything**（ICML 2026） | 画像・動画・UI などの注意予測を 1 モデルに統一。平均 6% 改善、コード公開予定 | 生成案のヒートマップを出し、「ボタンと見出しに注意が集まっているか」をプリフライト項目にする |
| **DeepGaze IIE**（Tübingen） | 定番の視線予測モデル。MIT1003 で 93% | 軽量に導入できる第一候補 |
| **HotGaze**（MIT ライセンス） | UI 向けの注意予測ツール | スクリプトから呼べる点で CI 組み込み向き |

注意: 視線予測は「見られるか」までで、「タップされるか」ではない。実績較正の代替にはならない。

## 4. 説得戦略のタグ体系（DNA タグの学術的裏付け）

| 研究 | 要点 | 活かし方 |
|---|---|---|
| **Persuasion Strategies in Advertisements**（AAAI 2023） | Pitt Ads 6.5 万枚に説得戦略ラベルを付与した初の広告コーパス。戦略語彙を公開 | フック 7 系統を、この語彙（社会的証明、希少性、権威、感情訴求など）に対応付けて DNA タグの標準語彙にする |
| **PVP**（ACL 2025） | 2.8 万枚に 9 つの説得戦略と 2,521 人の説得度評価、評価者の心理特性を付与。コード・データ公開 | 「ターゲット属性 × 戦略」の相性を事前確率として使う。ゲイン・フレーミング等はファイル名の既存タグと直接対応する |

## 5. 検証速度（統計）

| 研究 / OSS | 要点 | 活かし方 |
|---|---|---|
| **Anytime-valid 推論 / e-values**（Adobe 実装論文 2023、ライブラリ `expectation`・`confseq`） | いつ見ても有効な信頼区間。途中で止めても第一種過誤が膨らまない | 今の Beta-Binomial モンテカルロを、逐次停止に耐える信頼列に置き換える。「最短で結論が出る」が実験ボードの売りになる |
| **Thompson Sampling（Odds-Ratio TS 2026 設計ガイドなど）** | 少数アームの配信比率を自動で勝ち案に寄せる | ZEALS の配信側で比率制御ができるなら、固定 50/50 より早く収束する |

## 6. 周辺ツール（日本語対応）

| OSS | 用途 | 備考 |
|---|---|---|
| **clip-japanese-base-v2**（LY Corporation, Apache-2.0） | 過去資産の類似検索、ブリーフ文からの事例検索 | 日本語テキストと画像を同一空間に埋め込める。1,066 枚の索引化に使う第一候補 |
| **PaddleOCR-VL 1.5 / PP-OCRv5**（Apache-2.0） | 日本語 OCR | 今回は EasyOCR で代替したが、精度・速度ともこちらが上回る報告。第 2 回で置き換え候補 |
| **YomiToku** | 日本語特化 OCR（縦書き対応） | GPU 推奨。縦書きコピーが増えたら検討 |
| **Qwen-Image 2.0**（Apache-2.0） | 日本語を含む文字入り画像の生成 | 現状は Satori でテキストを正確に描画する方針のため不要。ビジュアル素材の生成のみ将来検討 |

## 7. 市場データ（参考）

- 出口意図ポップアップの平均転換率は 2〜4%、上位 1 割は 20% 近い（Wisepops 2025）。フォーム項目 1〜3 個で 2.1%、5 個以上で 1.4%（Omnisend 2026）。
- LINE 友だち追加型の公開ベンチマークは見つからず。ZEALS の実績がそのまま国内基準になる。

## 8. 優先順位（提案）

1. **今すぐ**: 辛口分析を Creative4U 型の比較推論に改修。DNA タグを AAAI 2023 / PVP の語彙に合わせる。
2. **第 2 回と同時**: clip-japanese-base-v2 で過去資産を索引化し、類似事例検索を付ける。
3. **実績 CSV 受領後**: ペア較正（CTR-Driven 方式）、anytime-valid 推論への置き換え。
4. **様子見**: 視線予測、レイアウト自動生成、画像生成。

## 出典

- [IDProxy (Xiaohongshu, 2026)](https://arxiv.org/html/2603.01590v1)
- [CTR-Driven Advertising Image Generation with MLLMs (WWW 2025)](https://arxiv.org/pdf/2502.06823)
- [Creative4U (2025)](https://arxiv.org/html/2508.12628v2)
- [PosterReward (CVPR 2026)](https://openaccess.thecvf.com/content/CVPR2026/html/Lai_PosterReward_Unlocking_Accurate_Evaluation_for_High-Quality_Graphic_Design_Generation_CVPR_2026_paper.html)
- [A³: Towards Advertising Aesthetic Assessment (CVPR 2026)](https://openaccess.thecvf.com/content/CVPR2026/html/Ji_A3_Towards_Advertising_Aesthetic_Assessment_CVPR_2026_paper.html)
- [Multimodal RewardBench 2 (2025)](https://arxiv.org/html/2512.16899)
- [BannerAgency (Sony, EMNLP 2025)](https://github.com/sony/BannerAgency)
- [Content-Aware Ad Banner Layout Generation with Two-Stage CoT (2025)](https://arxiv.org/html/2512.12596v1)
- [PosterLLaVA](https://github.com/posterllava/PosterLLaVA)
- [OpenCOLE (CyberAgent)](https://arxiv.org/html/2406.08232v1), [Crello dataset](https://www.huggingface.co/datasets/cyberagent/crello/tree/main)
- [Attend to Anything (ICML 2026)](https://icml.cc/virtual/2026/poster/61103)
- [DeepGaze IIE](https://arxiv.org/pdf/2105.12441)
- [HotGaze](https://pypi.org/project/hotgaze/)
- [Persuasion Strategies in Advertisements (AAAI 2023)](https://arxiv.org/abs/2208.09626)
- [PVP dataset (ACL 2025)](https://aclanthology.org/2025.acl-long.942)
- [Anytime-Valid Confidence Sequences in an Enterprise A/B Testing Platform (Adobe)](https://arxiv.org/pdf/2302.10108)
- [expectation (e-values library)](https://github.com/jakorostami/expectation), [confseq](https://github.com/gostevehoward/confseq/)
- [Odds-Ratio Thompson Sampling (2026)](https://arxiv.org/pdf/2609.19709)
- [clip-japanese-base-v2 (LY Corporation)](https://huggingface.co/line-corporation/clip-japanese-base-v2)
- [PaddleOCR-VL](https://arxiv.org/pdf/2510.14528), [YomiToku](https://www.sourcepulse.org/projects/24839822)
- [Qwen-Image](https://github.com/QwenLM/Qwen-Image)
- [Wisepops exit-intent statistics (2025)](https://wisepops.com/blog/exit-popup-examples), [Omnisend popup statistics (2026)](https://www.omnisend.com/blog/email-popup-statistics/)
