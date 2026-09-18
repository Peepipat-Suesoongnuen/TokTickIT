const STATUS_CLASS: Record<string, string> = {
  NEW: "badge-status-new",
  OPEN: "badge-status-open",
  IN_PROGRESS: "badge-status-in-progress",
  WAITING_FOR_REQUESTER: "badge-status-waiting",
  RESOLVED: "badge-status-resolved",
  REOPENED: "badge-status-reopened",
  CLOSED: "badge-status-closed",
  CANCELLED: "badge-status-cancelled",
};

export function PriorityBadge({ value }: { value: string }) {
  const token = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(value) ? value.toLowerCase() : "low";
  return <span className={`badge badge-priority-${token}`}>{value}</span>;
}

export function StatusBadge({ value }: { value: string }) {
  const cls = STATUS_CLASS[value] ?? "";
  return <span className={`badge ${cls}`}>{value}</span>;
}
