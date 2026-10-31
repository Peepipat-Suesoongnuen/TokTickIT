import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchRequesterDashboard, type RequesterDashboard as RequesterDashboardData } from "../api.js";

// Issue #80 — Requester dashboard (LAP4-06, UI-01). All numbers arrive
// backend-calculated; this component renders them verbatim and never
// aggregates or recomputes.
export default function RequesterDashboard() {
  const [data, setData] = useState<RequesterDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setData(await fetchRequesterDashboard());
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
          {[0, 1, 2].map((i) => (
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

  const cards = [
    { label: "Open Tickets", value: data.metrics.openTickets, link: data.links.openTickets, linkLabel: "View open tickets" },
    { label: "Waiting for You", value: data.metrics.waitingForRequester, link: data.links.waitingForRequester, linkLabel: "View waiting list" },
    { label: "Recently Resolved", value: data.metrics.recentlyResolved, link: data.links.recentlyResolved, linkLabel: "View resolved tickets" },
  ];

  const empty = data.metrics.openTickets === 0 && data.recentlyUpdated.length === 0 && data.recentlyResolved.length === 0;

  return (
    <div>
      <h2 className="h4 mb-3">Dashboard</h2>
      <div className="row g-2 mb-3">
        {cards.map((c) => (
          <div key={c.label} className="col-md-4">
            <div className="card p-3">
              <div className="form-text">{c.label}</div>
              <div className="h4 mb-2">{c.value}</div>
              <Link className="btn btn-outline-success btn-sm" to={c.link} aria-label={c.linkLabel}>
                {c.linkLabel}
              </Link>
            </div>
          </div>
        ))}
      </div>
      {empty && (
        <div className="card p-3 mb-3">
          <p className="mb-2">You have no tickets yet. Create your first ticket to get started.</p>
          <Link className="btn btn-success btn-sm" to="/create">
            Create Ticket
          </Link>
        </div>
      )}
      <section aria-label="Recently updated tickets" className="card p-3 mb-3">
        <h3 className="h6">Recently Updated</h3>
        {data.recentlyUpdated.length === 0 ? (
          <p className="text-secondary mb-0">Nothing here yet.</p>
        ) : (
          <ul className="list-group">
            {data.recentlyUpdated.map((t) => (
              <li key={t.id} className="list-group-item d-flex justify-content-between align-items-center">
                <Link to={`/tickets/${t.id}`}>{t.ticketNumber}</Link>
                <span className="text-secondary small">
                  {t.summary} · {t.currentStatus}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Recently resolved tickets" className="card p-3">
        <h3 className="h6">Recently Resolved</h3>
        {data.recentlyResolved.length === 0 ? (
          <p className="text-secondary mb-0">Nothing here yet.</p>
        ) : (
          <ul className="list-group">
            {data.recentlyResolved.map((t) => (
              <li key={t.id} className="list-group-item d-flex justify-content-between align-items-center">
                <Link to={`/tickets/${t.id}`}>{t.ticketNumber}</Link>
                <span className="text-secondary small">
                  {t.summary} · {t.currentStatus}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
