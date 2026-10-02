import type { ActionTaken } from "../../../api.js";
import { ActionStatusBadge } from "../../../components/Badges.js";

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

// Issue #78 — Actions Taken table. Renders the server-stable order as-is
// (no client-side aggregation or re-sorting); empty list renders the
// empty state instead of a table.
export function ActionTable({ actions }: { actions: ActionTaken[] }) {
  if (actions.length === 0) {
    return <p className="text-secondary">No actions taken yet.</p>;
  }
  return (
    <div className="table-responsive">
      <table className="table lab2-table">
        <thead>
          <tr>
            {["Date", "Description", "Result", "Recorded By", "Assignee", "Follow-Up", "Status", "Version"].map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {actions.map((a) => (
            <tr key={a.id}>
              <td>{formatDateTime(a.actionDate)}</td>
              <td>{a.description}</td>
              <td>{a.result ?? "—"}</td>
              <td>{a.recordedBy.name}</td>
              <td>{a.assignedTo ? a.assignedTo.name : "Recorder accountable"}</td>
              <td>{a.followUpRequired ? a.followUpNote ?? "Required" : "—"}</td>
              <td>
                <ActionStatusBadge value={a.status} />
              </td>
              <td>{a.version}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
