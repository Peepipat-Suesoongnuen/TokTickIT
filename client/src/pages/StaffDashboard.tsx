import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchStaffDashboard, type StaffDashboard as StaffDashboardData } from "../api.js";

// Issue #80 — Staff dashboard (LAP4-07, UI-02). All numbers arrive
// backend-calculated; this component renders them verbatim and never
// aggregates or recomputes. recordedByMe is intentionally non-clickable.
export default function StaffDashboard() {
  const [data, setData] = useState<StaffDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setData(await fetchStaffDashboard());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && data === null) {
    // Reviewer finding 4 (FIX-REVIEW PR #86): ui-spec §3 requires skeleton
    // placeholders while loading, not a bare text line.
    return (
      <div role="status" aria-label="Loading dashboard" data-testid="dashboard-skeleton">
        <div className="row g-2 mb-3" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="col-md-4">
              <div className="card p-3">
                <div className="placeholder-glow">
                  <span className="placeholder col-6" />
                </div>
                <div className="placeholder-glow">
                  <span className="placeholder col-4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (failed && data === null) {
    return (
      <div>
        <div className="alert alert-danger" role="alert">
          Unable to load the dashboard.
        </div>
        <button type="button" className="btn btn-outline-success btn-sm" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div>
      <h2 className="h4 mb-3">Staff Dashboard</h2>
      <div className="row g-2 mb-3">
        <div className="col-md-4">
          <div className="card p-3">
            <div className="form-text">Owned by me</div>
            <div className="h4 mb-2">{data.metrics.ownedByMe}</div>
            <Link className="btn btn-outline-success btn-sm" to={data.links.ownedByMe} aria-label="View owned tickets">
              View owned tickets
            </Link>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card p-3">
            <div className="form-text">Assigned to me</div>
            <div className="h4 mb-2">{data.metrics.assignedToMe}</div>
            <Link className="btn btn-outline-success btn-sm" to={data.links.assignedToMe} aria-label="View assigned tickets">
              View assigned tickets
            </Link>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card p-3">
            <div className="form-text">Recorded by me</div>
            <div className="h4 mb-2">{data.metrics.recordedByMe}</div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card p-3">
            <div className="form-text">Unassigned</div>
            <div className="h4 mb-2">{data.metrics.unassigned}</div>
            <Link className="btn btn-outline-success btn-sm" to={data.links.unassigned} aria-label="View unassigned tickets">
              View unassigned
            </Link>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card p-3">
            <div className="form-text">Urgent HIGH/CRITICAL</div>
            <div className="h4 mb-2">{data.metrics.urgentHighPriority}</div>
            <Link
              className="btn btn-outline-success btn-sm"
              to={data.links.urgentHighPriority}
              aria-label="View urgent tickets"
            >
              View urgent tickets
            </Link>
          </div>
        </div>
        {data.userCounts && (
          <div className="col-md-4">
            <div className="card p-3">
              <div className="form-text">User accounts</div>
              <div className="h4 mb-2">{data.userCounts.total}</div>
              <div className="text-secondary small mb-1">Active users: {data.userCounts.active}</div>
              <div className="text-secondary small mb-2">
                Deactivated: {data.userCounts.total - data.userCounts.active} (derived)
              </div>
              <ul className="list-group list-group-flush mb-2">
                {Object.entries(data.userCounts.byRole).map(([role, count]) => (
                  <li key={role} className="list-group-item d-flex justify-content-between align-items-center px-0">
                    <span>{role}</span>
                    <span className="d-flex align-items-center gap-2">
                      <span>{count}</span>
                      <Link
                        className="btn btn-outline-success btn-sm"
                        to={`/admin/users?role=${role}`}
                        aria-label={`View ${role} users`}
                      >
                        View
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
              <Link className="btn btn-outline-success btn-sm" to={data.links.usersByRole} aria-label="View users">
                View users
              </Link>
            </div>
          </div>
        )}
      </div>
      <section aria-label="Tickets by status" className="card p-3 mb-3">
        <h3 className="h6">By Status</h3>
        {Object.keys(data.metrics.byStatus).length === 0 ? (
          <p className="text-secondary mb-0">Nothing here yet.</p>
        ) : (
          <ul className="list-group">
            {Object.entries(data.metrics.byStatus).map(([status, count]) => (
              <li key={status} className="list-group-item d-flex justify-content-between align-items-center">
                <Link to={`/staff/queue?currentStatus=${status}`} aria-label={`View ${status} tickets`}>
                  {status}
                </Link>
                <span className="text-secondary small">{count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Tickets by IT priority" className="card p-3 mb-3">
        <h3 className="h6">By IT Priority</h3>
        {Object.keys(data.metrics.byItPriority).length === 0 ? (
          <p className="text-secondary mb-0">Nothing here yet.</p>
        ) : (
          <ul className="list-group">
            {Object.entries(data.metrics.byItPriority).map(([priority, count]) => (
              <li key={priority} className="list-group-item d-flex justify-content-between align-items-center">
                <Link to={`/staff/queue?itPriority=${priority}&state=open`} aria-label={`View ${priority} tickets`}>
                  {priority}
                </Link>
                <span className="text-secondary small">{count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Recently updated tickets" className="card p-3 mb-3">
        <h3 className="h6">Recently Updated</h3>
        {data.recentlyUpdated.length === 0 ? (
          <p className="text-secondary mb-0">Nothing here yet.</p>
        ) : (
          <ul className="list-group">
            {data.recentlyUpdated.map((t) => (
              <li key={t.id} className="list-group-item d-flex justify-content-between align-items-center">
                <Link to={`/staff/tickets/${t.id}`}>{t.ticketNumber}</Link>
                <span className="text-secondary small">
                  {t.summary} · {t.currentStatus}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Urgent tickets" className="card p-3">
        <h3 className="h6">Urgent Tickets</h3>
        {data.urgentTickets.length === 0 ? (
          <p className="text-secondary mb-0">Nothing here yet.</p>
        ) : (
          <ul className="list-group">
            {data.urgentTickets.map((t) => (
              <li key={t.id} className="list-group-item d-flex justify-content-between align-items-center">
                <Link to={`/staff/tickets/${t.id}`}>{t.ticketNumber}</Link>
                <span className="text-secondary small">
                  {t.summary} · {t.itPriority}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
