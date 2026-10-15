"use client";

/** Opens the browser print dialog (save as PDF). Hidden in the printout itself. */
export function PrintButton({ label = "印刷・PDF で保存" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn-ghost print:hidden">
      {label}
    </button>
  );
}
