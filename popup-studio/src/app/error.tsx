"use client";

/** Shown instead of the host's blank 500 page; the digest links the screen to the server log entry. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card mx-auto mt-10 flex max-w-xl flex-col gap-3 p-6">
      <h1 className="text-lg font-black">画面の表示に失敗しました</h1>
      <p className="text-sm text-muted">サーバー側でエラーが起きました。もう一度試しても直らない場合は、下の識別子を添えて共有してください。</p>
      <code className="rounded bg-bg p-2 text-xs">{error.digest ? `digest: ${error.digest}` : error.message}</code>
      <div className="flex gap-2">
        <button type="button" className="btn-primary" onClick={() => reset()}>もう一度試す</button>
        <a className="btn-ghost" href="/api/health">診断ページを開く</a>
      </div>
    </div>
  );
}
