export function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 80 ? "bg-accent-soft text-accent" : score >= 60 ? "bg-warn-soft text-warn" : "bg-danger-soft text-danger";
  return (
    <span className={`chip ${cls} tabular-nums`} title="プリフライトスコア">
      {score}
    </span>
  );
}
