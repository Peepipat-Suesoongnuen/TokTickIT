import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listUsers, ManagedUser } from "../api";
import { UserRoleBadge, UserStatusBadge } from "../components/Badges.js";

// Issue #50 (Lab 3) — minimalist User Management list (ui-spec §7.1):
// Name/Email/Role/Status columns (no Edit column — the row itself opens
// Edit and is keyboard-operable), search + optional role filter only.
// (Path C: the ID column / Status filter / local pagination were removed
// again — they contradict Labsheet + api-spec §13.1 + ui-spec §7.1 and live
// on in the follow-up issue instead.)
export default function AdminUsers() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [role, setRole] = useState("");
  const [data, setData] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const requestSequence = useRef(0);
  const isInitialLoading = loading && data.length === 0 && !error && !forbidden;
  const isFiltered =
    debouncedSearch !== "" || role !== "";

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = async () => {
    const seq = ++requestSequence.current;
    setLoading(true);
    setError("");
    setForbidden(false);
    try {
      const res = await listUsers({
        search: debouncedSearch || undefined,
        role: role || undefined,
      });
      if (seq === requestSequence.current) {
        setData(res.data);
      }
    } catch (err: unknown) {
      if (seq !== requestSequence.current) return;
      const e = err as { status?: number; body?: { error?: { message?: string } } };
      if (e.status === 403) {
        setForbidden(true);
      } else {
        setError(e.body?.error?.message ?? "Unable to connect to TokTickIT API");
      }
    } finally {
      if (seq === requestSequence.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void load();
    return () => {
      requestSequence.current += 1;
    };
  }, [debouncedSearch, role]);

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setRole("");
  };

  const openUser = (id: number) => {
    navigate(`/admin/users/${id}`);
  };

  const openFromKey = (event: React.KeyboardEvent<HTMLElement>, id: number) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openUser(id);
    }
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3 lab2-mobile-stack">
        <h2 className="h4 mb-0">User Management</h2>
        <div className="d-flex gap-2 lab2-mobile-stack">
          <button className="btn btn-outline-success" type="button" onClick={clearFilters}>
            Clear Filters
          </button>
          <button className="btn btn-outline-success" type="button" onClick={() => void load()}>
            Refresh
          </button>
          <Link className="btn btn-success btn-zen-primary" to="/admin/users/new">
            Create User
          </Link>
        </div>
      </div>

      <div className="card mb-3 p-3">
        <div className="lab3-admin-toolbar-grid" data-testid="admin-users-toolbar">
          <div>
            <label htmlFor="admin-users-search" className="form-label lab2-toolbar-label">Search</label>
            <input
              id="admin-users-search"
              className="form-control"
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="admin-users-role" className="form-label lab2-toolbar-label">Role</label>
            <select id="admin-users-role" className="form-select" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">All Roles</option>
              <option value="REQUESTER">Requester</option>
              <option value="IT_STAFF">IT Staff</option>
              <option value="ADMINISTRATOR">Administrator</option>
            </select>
          </div>
        </div>
      </div>

      {isInitialLoading && <p className="text-secondary">Loading users…</p>}

      {forbidden && (
        <div className="alert alert-warning" role="alert">
          You do not have permission to manage users.
        </div>
      )}

      {error && (
        <div className="alert alert-danger d-flex justify-content-between align-items-center" role="alert" aria-live="polite">
          <span>{error}</span>
          <button className="btn btn-outline-success btn-sm" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && !forbidden && data.length === 0 && !isFiltered && (
        <div className="alert alert-info text-center">
          <p className="mb-0">No users yet</p>
        </div>
      )}

      {!loading && !error && !forbidden && data.length === 0 && isFiltered && (
        <div className="alert alert-warning text-center" role="status">
          <p className="mb-2">No users match the current filters</p>
          <button className="btn btn-outline-success btn-sm" onClick={clearFilters}>
            Clear Filters
          </button>
        </div>
      )}

      {!error && !forbidden && data.length > 0 && (
        <>
          <div className="d-none d-md-block table-responsive">
            <table className="table table-hover align-middle lab2-ticket-table lab2-admin-table" aria-busy={loading}>
              <colgroup>
                <col className="lab2-admin-col-name" />
                <col className="lab2-admin-col-email" />
                <col className="lab2-admin-col-role" />
                <col className="lab2-admin-col-status" />
              </colgroup>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((u) => (
                  <tr
                    key={u.id}
                    className="lab2-ticket-row admin-user-row"
                    tabIndex={0}
                    onClick={() => openUser(u.id)}
                    onKeyDown={(event) => openFromKey(event, u.id)}
                    aria-label={`Edit user ${u.name}`}
                  >
                    <td>{u.name}</td>
                    <td className="lab2-category-cell">{u.email}</td>
                    <td>
                      <UserRoleBadge value={u.role} />
                    </td>
                    <td>
                      <UserStatusBadge active={u.active} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="d-md-none" aria-busy={loading}>
            {data.map((u) => (
              <div
                key={u.id}
                className="card mb-2 p-3 lab2-ticket-card"
                tabIndex={0}
                role="link"
                aria-label={`Edit user ${u.name}`}
                onClick={() => openUser(u.id)}
                onKeyDown={(event) => openFromKey(event, u.id)}
              >
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <div className="fw-bold">{u.name}</div>
                    <div className="small text-secondary">{u.email}</div>
                  </div>
                  <UserStatusBadge active={u.active} />
                </div>
                <div className="mt-2">
                  <UserRoleBadge value={u.role} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
