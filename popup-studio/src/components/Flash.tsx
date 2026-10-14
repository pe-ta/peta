/** One-line notice driven by ?msg= / ?err= on the current URL (set by server actions after redirect). */
export function Flash({ msg, err }: { msg?: string; err?: string }) {
  if (!msg && !err) return null;
  return (
    <div role="status" className={`rounded-md border px-3 py-2 text-sm font-bold ${err ? "border-danger/40 bg-danger-soft text-danger" : "border-accent/40 bg-accent-soft text-accent"}`}>
      {err ?? msg}
    </div>
  );
}

export function readFlash(sp: { [k: string]: string | string[] | undefined }) {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return { msg: one(sp.msg), err: one(sp.err) };
}
