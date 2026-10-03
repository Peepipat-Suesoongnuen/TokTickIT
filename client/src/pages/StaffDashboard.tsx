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

  if (loading && data === null) return <p className="text-secondary">Loading dashboard…</p>;
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
              <Link className="btn btn-outline-success btn-sm" to={data.links.usersByRole} aria-label="View users">
                View users
              </Link>
            </div>
          </div>
        )}
      </div>
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
