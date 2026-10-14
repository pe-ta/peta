"use client";

import { useState } from "react";

export function CopyButton({ text, label = "コピー" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          window.prompt("コピーしてください", text);
        }
      }}
    >
      {done ? "コピーしました" : label}
    </button>
  );
}
