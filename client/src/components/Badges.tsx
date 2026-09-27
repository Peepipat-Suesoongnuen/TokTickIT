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
  // abbreviated so the badge fits its fixed frame. The full business
  // value stays on title/aria-label (mockup pattern). Verified harmless:
  // the Lab 2 A11Y-01 strict-violation suspects were My Tickets sort
  // buttons (hidden elements count toward strict mode), never badge
  // spans — no violation list ever contained a badge element.
  const display = value === "WAITING_FOR_REQUESTER" ? "Wait for Req." : value;
  return (
    <span className={`badge ${cls}`} title={value} aria-label={value}>
      {display}
    </span>
  );
}

// Issue #50 — Administrator User Management badges reuse the same
// bordered highlight family (ui-spec §7.1), not a separate pill theme.
// Role display follows the approved mockup language.
const ROLE_CLASS: Record<string, string> = {
  REQUESTER: "badge-role-requester",
  IT_STAFF: "badge-role-staff",
  ADMINISTRATOR: "badge-role-admin",
};

const ROLE_DISPLAY: Record<string, string> = {
  REQUESTER: "REQUESTER",
  IT_STAFF: "IT STAFF",
  ADMINISTRATOR: "ADMINISTRATOR",
};

export function UserRoleBadge({ value }: { value: string }) {
  const cls = ROLE_CLASS[value] ?? "";
  return <span className={`badge ${cls}`}>{ROLE_DISPLAY[value] ?? value}</span>;
}

export function UserStatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`badge ${active ? "badge-account-active" : "badge-account-inactive"}`}>
      {active ? "ACTIVE" : "INACTIVE"}
    </span>
  );
}
