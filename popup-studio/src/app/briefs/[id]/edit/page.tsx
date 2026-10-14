import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/store";
import { updateBriefAction } from "@/lib/actions";
import { BriefForm } from "@/components/BriefForm";
import { Flash, readFlash } from "@/components/Flash";

export const dynamic = "force-dynamic";

export default async function EditBriefPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const { id } = await params;
  const brief = await db.briefs.get(id);
  if (!brief) notFound();
  const flash = readFlash(await searchParams);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="text-xs text-muted">
        <Link href="/" className="hover:underline">実験ボード</Link> / <Link href={`/briefs/${id}`} className="hover:underline">{brief.clientName}</Link> / ブリーフを編集
      </div>
      <div>
        <h1 className="text-2xl font-black tracking-tight">ブリーフを編集</h1>
        <p className="mt-1 text-sm text-muted">変更は新しく生成する候補に反映されます。既存の候補を更新したい場合は保存後に「下書きを再生成」してください。</p>
      </div>
      <Flash {...flash} />
      <BriefForm action={updateBriefAction} brief={brief} mode="edit" />
    </div>
  );
}
