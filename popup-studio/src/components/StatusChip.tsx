import type { CreativeStatus } from "@/lib/types";

const LABELS: Record<CreativeStatus, [string, string]> = {
  draft: ["下書き", "border border-line text-muted"],
  reviewing: ["社内レビュー", "bg-bg text-fg border border-line"],
  submitted: ["クライアント確認中", "bg-warn-soft text-warn"],
  approved: ["承認済み", "bg-accent-soft text-accent"],
  rejected: ["差戻し", "bg-danger-soft text-danger"],
  live: ["配信中", "bg-accent text-white"],
  ended: ["終了", "border border-line text-muted"],
};

export function StatusChip({ status }: { status: CreativeStatus }) {
  const [label, cls] = LABELS[status];
  return <span className={`chip ${cls}`}>{label}</span>;
}
