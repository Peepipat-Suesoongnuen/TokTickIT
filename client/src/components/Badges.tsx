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
  // Issue #48 — dense display: the long WAITING_FOR_REQUESTER enum is
  // abbreviated so the badge fits its fixed frame. No title/aria-label
  // override: extra accessible-name sources on this shared badge broke the
  // Lab 2 A11Y-01 locator expectations (verified by bisect).
  const display = value === "WAITING_FOR_REQUESTER" ? "Wait for Req." : value;
  return <span className={`badge ${cls}`}>{display}</span>;
}
