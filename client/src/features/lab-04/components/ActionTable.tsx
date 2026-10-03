import type { ActionTaken } from "../../../api.js";
import { ActionStatusBadge } from "../../../components/Badges.js";

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

// Issue #78 — Actions Taken table. Renders the server-stable order as-is
// (no client-side aggregation or re-sorting); empty list renders the
// empty state instead of a table. Desktop shows the table; mobile
// (below md) collapses to cards with full data parity (ui-spec s.8).
export function ActionTable({ actions }: { actions: ActionTaken[] }) {
  if (actions.length === 0) {
    return <p className="text-secondary">No actions taken yet.</p>;
  }
  return (
    <>
      <div className="table-responsive d-none d-md-block">
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
      <div className="actions-cards d-md-none">
        {actions.map((a) => (
          <div key={a.id} className="card mb-2 p-3">
            <div className="fw-bold">{a.description}</div>
            <div className="small text-secondary">Date: {formatDateTime(a.actionDate)}</div>
            <div>Result: {a.result ?? "—"}</div>
            <div className="small text-secondary">Recorded By: {a.recordedBy.name}</div>
            <div className="small text-secondary">
              Assignee: {a.assignedTo ? a.assignedTo.name : "Recorder accountable"}
            </div>
            <div className="small text-secondary">
              Follow-Up: {a.followUpRequired ? a.followUpNote ?? "Required" : "—"}
            </div>
            <div>
              <ActionStatusBadge value={a.status} /> <span className="small text-secondary">Version {a.version}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
