import type { Metadata } from "next";
import "./globals.css";
import { getStore } from "@/lib/store";
import { aiAvailable, aiProviderName } from "@/lib/ai";
import { weakSecretInProduction } from "@/lib/secret";
import { AppChrome, AppFooter } from "@/components/AppChrome";

export const metadata: Metadata = {
  title: "Popup Lab",
  description: "勝ちポップアップ発見エンジン。仮説・生成・辛口分析・承認・配信・勝敗判定を一本のループで回す",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const durable = getStore().durable;
  const ai = aiAvailable();
  const providerName = aiProviderName();
  const weakSecret = weakSecretInProduction();
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <AppChrome
          providerName={providerName}
          warnings={[
            ...(!durable ? ["データベース未接続: データはインスタンスのメモリに保持され、再起動で消えます（DATABASE_URL を設定してください）。"] : []),
            ...(!ai ? ["生成AI未接続: コピー生成と辛口分析はルールベースで動きます（GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY のいずれかを設定してください）。"] : []),
            ...(weakSecret ? ["署名キーが既定値です。承認リンクが偽造でき、結果の自動連携 API は無効です（REVIEW_SECRET を設定してください）。"] : []),
          ]}
        />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        <AppFooter />
      </body>
    </html>
  );
}
