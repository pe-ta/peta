import type { Brief } from "@/lib/types";
import { APPEAL_AXES, MOTIONS, VISUAL_AXES, WIN_METRICS } from "@/lib/types";
import { PendingButton } from "./PendingButton";

/** Shared form for creating and editing a brief. Grid fields are shown only on create. */
export function BriefForm({ action, brief, mode }: { action: (fd: FormData) => Promise<void>; brief?: Brief; mode: "create" | "edit" }) {
  const b = brief;
  return (
    <form action={action} className="mx-auto flex max-w-3xl flex-col gap-6">
      {b && <input type="hidden" name="briefId" value={b.id} />}

      <section className="card flex flex-col gap-4 p-5">
        <h2 className="text-sm font-black">勝ちの定義</h2>
        <p className="text-xs text-muted">挑戦者がチャンピオンに勝ったかを判定する指標。成果報酬の計算根拠と揃えてください。</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {WIN_METRICS.map((m, i) => (
            <label key={m.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-line p-2.5 text-sm has-checked:border-accent has-checked:bg-accent-soft">
              <input type="radio" name="winMetric" value={m.id} defaultChecked={b ? b.winMetric === m.id : i === 0} className="mt-1 accent-accent" />
              <span>
                <span className="font-bold">{m.label}</span>
                <span className="block text-xs text-muted">{m.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="card flex flex-col gap-4 p-5">
        <h2 className="text-sm font-black">クライアントと LP</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="clientName">クライアント名 *</label>
            <input id="clientName" name="clientName" required defaultValue={b?.clientName} className="input" placeholder="例: メンズライフクリニック" />
          </div>
          <div>
            <label className="label" htmlFor="industry">業種</label>
            <select id="industry" name="industry" className="input" defaultValue={b?.industry ?? "美容・医療"}>
              {["美容・医療", "健康食品・サプリ", "化粧品", "金融・保険", "不動産", "教育・スクール", "人材", "EC・通販", "その他"].map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </div>
        </div>
        {mode === "create" ? (
          <div>
            <label className="label" htmlFor="lpUrl">LP URL（タイトル・OG画像・配色を自動抽出）</label>
            <input id="lpUrl" name="lpUrl" type="url" className="input" placeholder="https://example.com/lp" />
          </div>
        ) : (
          b?.lpUrl && <p className="text-xs text-muted">LP: {b.lpTitle ?? b.lpUrl}（URL の変更は新しいブリーフで）</p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="logoText">ロゴ表記（テキスト）</label>
            <input id="logoText" name="logoText" defaultValue={b?.brand.logoText} className="input" placeholder="未入力ならクライアント名" />
          </div>
          <div>
            <label className="label" htmlFor="deviceSize">対象デバイス</label>
            <select id="deviceSize" name="deviceSize" className="input" defaultValue={b?.deviceSize ?? "sp"}>
              <option value="sp">スマホ（640×800）</option>
              <option value="pc">PC（800×500）</option>
            </select>
          </div>
        </div>
      </section>

      <section className="card flex flex-col gap-4 p-5">
        <h2 className="text-sm font-black">オファーと文脈</h2>
        <div>
          <label className="label" htmlFor="offer">オファー *</label>
          <input id="offer" name="offer" required defaultValue={b?.offer} className="input" placeholder="例: LINE限定 55%OFF クーポン" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="target">ターゲット *（最初の区切りまでが人物像として使われます）</label>
            <input id="target" name="target" required defaultValue={b?.target} className="input" placeholder="例: 30代男性、初めて検討、価格を比較中" />
          </div>
          <div>
            <label className="label" htmlFor="exitContext">離脱文脈</label>
            <input id="exitContext" name="exitContext" defaultValue={b?.exitContext} className="input" placeholder="例: 料金ページで戻る操作 / 滞在30秒で離脱" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="tone">トーン</label>
            <input id="tone" name="tone" defaultValue={b?.brand.tone} className="input" placeholder="例: 医療らしい信頼感、押しつけない" />
          </div>
          <div>
            <label className="label" htmlFor="ngWords">NGワード（読点区切り）</label>
            <input id="ngWords" name="ngWords" defaultValue={b?.brand.ngWords.join("、")} className="input" placeholder="例: 激安、完治、No.1" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="notes">補足</label>
          <textarea id="notes" name="notes" rows={2} defaultValue={b?.notes} className="input" placeholder="参考にしたい過去の勝ちパターン、避けたい表現など" />
        </div>
      </section>

      <section className="card flex flex-col gap-4 p-5">
        <h2 className="text-sm font-black">ブランドカラー{mode === "create" ? "（空欄なら LP から抽出）" : ""}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {(
            [
              ["primary", "主色", b?.brand.primary],
              ["accent", "アクセント（CTA）", b?.brand.accent],
              ["background", "背景", b?.brand.background],
            ] as const
          ).map(([name, label, value]) => (
            <div key={name}>
              <label className="label" htmlFor={name}>{label}</label>
              <div className="flex items-center gap-2">
                <input id={name} name={name} defaultValue={value} className="input" placeholder="#0b6e4f" pattern="^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$" />
                {value && <span className="h-8 w-8 shrink-0 rounded border border-line" style={{ background: value }} />}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted">薄い色を指定しても、CTA ボタンは白文字が読める濃さまで自動で補正されます。</p>
      </section>

      {mode === "create" && (
        <section className="card flex flex-col gap-5 p-5">
          <div>
            <h2 className="text-sm font-black">仮説グリッド</h2>
            <p className="mt-1 text-xs text-muted">訴求軸 × レイアウト × 動き の組み合わせ数だけ候補が生成されます。コピーは訴求軸ごとに1セットで、レイアウトと動きの効果を切り分けて検証できます。最初は 6 案前後が扱いやすい数です。</p>
          </div>
          <fieldset>
            <legend className="label">訴求軸</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {APPEAL_AXES.map((a, i) => (
                <label key={a.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-line p-2.5 text-sm has-checked:border-accent has-checked:bg-accent-soft">
                  <input type="checkbox" name="appealAxes" value={a.id} defaultChecked={i < 3} className="mt-1 accent-accent" />
                  <span>
                    <span className="font-bold">{a.label}</span>
                    <span className="block text-xs text-muted">{a.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset>
              <legend className="label">レイアウト</legend>
              <div className="flex flex-col gap-2">
                {VISUAL_AXES.map((v, i) => (
                  <label key={v.id} className="flex items-start gap-2 rounded-md border border-line p-2.5 text-sm has-checked:border-accent has-checked:bg-accent-soft">
                    <input type="checkbox" name="visualAxes" value={v.id} defaultChecked={i < 2} className="mt-1 accent-accent" />
                    <span>
                      <span className="font-bold">{v.label}</span>
                      <span className="block text-xs text-muted">{v.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="label">動き</legend>
              <div className="flex flex-col gap-2">
                {MOTIONS.map((m, i) => (
                  <label key={m.id} className="flex items-center gap-2 rounded-md border border-line p-2.5 text-sm has-checked:border-accent has-checked:bg-accent-soft">
                    <input type="checkbox" name="motions" value={m.id} defaultChecked={i === 0} className="accent-accent" /> {m.label}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">GIF は 1 案あたり描画に数秒かかります。まず静止で比較し、勝ち筋に動きを足すのが速いです。</p>
            </fieldset>
          </div>
        </section>
      )}

      <div className="flex items-center justify-end gap-3">
        <PendingButton pendingText={mode === "create" ? "LP を読み取り、候補を生成しています…" : "保存しています…"}>
          {mode === "create" ? "挑戦者候補を生成する" : "ブリーフを保存"}
        </PendingButton>
      </div>
    </form>
  );
}
