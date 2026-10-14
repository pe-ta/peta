import { createBriefAction } from "@/lib/actions";
import { BriefForm } from "@/components/BriefForm";
import { Flash, readFlash } from "@/components/Flash";

export const maxDuration = 60;

export default async function NewBriefPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const flash = readFlash(await searchParams);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">新しい実験（ブリーフ）</h1>
        <p className="mt-1 text-sm text-muted">入力は3分。送信すると LP を読み取り、選んだ組み合わせで挑戦者候補を生成します。</p>
      </div>
      <Flash {...flash} />
      <BriefForm action={createBriefAction} mode="create" />
    </div>
  );
}
