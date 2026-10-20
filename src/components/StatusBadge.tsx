const STYLES: Record<string, string> = {
  DRAFT: "border-dashed border-neutral-400 text-neutral-600",
  PUBLISHED: "border-neutral-300 bg-neutral-100 text-neutral-800",
  OPEN: "border-warn/30 bg-amber-50 text-warn",
  CANCELLED: "border-neutral-300 text-neutral-400 line-through",
  PENDING: "border-warn/30 bg-amber-50 text-warn",
  APPROVED: "border-ok/30 bg-green-50 text-ok",
  REJECTED: "border-bad/30 bg-red-50 text-bad",
  EXPORTED: "border-neutral-300 bg-neutral-100 text-neutral-600",
  ACTIVE: "border-ink bg-ink text-white",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <span className={`badge ${STYLES[status] ?? ""}`}>{label ?? status.charAt(0) + status.slice(1).toLowerCase()}</span>;
}
