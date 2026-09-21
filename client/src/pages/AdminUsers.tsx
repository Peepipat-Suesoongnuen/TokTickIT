import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listUsers, ManagedUser } from "../api";
import { UserRoleBadge, UserStatusBadge } from "../components/Badges.js";
import Pagination from "../components/Pagination.js";
import { TicketListMeta } from "../api.js";

// Issue #50 (Lab 3) — minimalist User Management list (ui-spec §7.1):
// Name/Email/Role/Status columns (no Edit column — the row itself opens
// Edit and is keyboard-operable), search + optional role filter only.
export default function AdminUsers() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  // Explicit owner override (2026-09-21): a client-side Status filter was
  // ordered despite Labsheet/Contract/agent.md §14 forbidding a Status list
  // filter. Deliberately client-side only: the server contract (api-spec
  // §13.1 — `active` query rejected with 400) is left untouched, so the
  // API surface does not diverge. Contract docs now DIVERGE from the UI on
  // this point — flagged for amendment, not silently rewritten.
  const [statusFilter, setStatusFilter] = useState("");
  const [data, setData] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const requestSequence = useRef(0);
  const isInitialLoading = loading && data.length === 0 && !error && !forbidden;
  const isFiltered =
    debouncedSearch !== "" || role !== "" || statusFilter !== "";
  // Numeric-only search targets User ID over the loaded rows instead of
  // the server name/email search (server contract unchanged).
  const isIdSearch = /^\d+$/.test(debouncedSearch);
  const filteredData = data.filter((u) => {
    if (isIdSearch && !String(u.id).includes(debouncedSearch)) return false;
    if (statusFilter === "") return true;
    return statusFilter === "active" ? u.active : !u.active;
  });

  const totalCount = filteredData.length;
  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize);
  const safePage = totalPages === 0 ? 1 : Math.min(page, totalPages);
  const pagedData = filteredData.slice((safePage - 1) * pageSize, safePage * pageSize);
  const meta: TicketListMeta = {
    page: safePage,
    pageSize,
    totalCount,
    totalPages,
    hasNextPage: safePage < totalPages,
    hasPreviousPage: safePage > 1,
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Client-side paging over the loaded rows (the admin list API has no
  // pagination parameters): reset to the first page whenever the visible
  // set changes.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, role, statusFilter, pageSize]);

  const load = async () => {
    const seq = ++requestSequence.current;
    setLoading(true);
    setError("");
    setForbidden(false);
    try {
      const res = await listUsers({
        search: !isIdSearch && debouncedSearch ? debouncedSearch : undefined,
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
    setStatusFilter("");
    setPage(1);
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
          <div>
            <label htmlFor="admin-users-status" className="form-label lab2-toolbar-label">Status</label>
            <select id="admin-users-status" className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div>
            <label htmlFor="admin-users-page-size" className="form-label lab2-toolbar-label">Rows per page</label>
            <select id="admin-users-page-size" className="form-select" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
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

      {!loading && !error && !forbidden && filteredData.length === 0 && !isFiltered && (
        <div className="alert alert-info text-center">
          <p className="mb-0">No users yet</p>
        </div>
      )}

      {!loading && !error && !forbidden && filteredData.length === 0 && isFiltered && (
        <div className="alert alert-warning text-center" role="status">
          <p className="mb-2">No users match the current filters</p>
          <button className="btn btn-outline-success btn-sm" onClick={clearFilters}>
            Clear Filters
          </button>
        </div>
      )}

      {!error && !forbidden && filteredData.length > 0 && (
        <>
          <div className="d-none d-md-block table-responsive">
            <table className="table table-hover align-middle lab2-ticket-table lab2-admin-table" aria-busy={loading}>
              <colgroup>
                <col className="lab2-admin-col-id" />
                <col className="lab2-admin-col-name" />
                <col className="lab2-admin-col-email" />
                <col className="lab2-admin-col-role" />
                <col className="lab2-admin-col-status" />
              </colgroup>
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pagedData.map((u) => (
                  <tr
                    key={u.id}
                    className="lab2-ticket-row admin-user-row"
                    tabIndex={0}
                    onClick={() => openUser(u.id)}
                    onKeyDown={(event) => openFromKey(event, u.id)}
                    aria-label={`Edit user ${u.name}`}
                  >
                    <td>{u.id}</td>
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
            {pagedData.map((u) => (
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
                    <div className="small text-secondary">User ID: {u.id}</div>
                  </div>
                  <UserStatusBadge active={u.active} />
                </div>
                <div className="mt-2">
                  <UserRoleBadge value={u.role} />
                </div>
              </div>
            ))}
          </div>

          <Pagination meta={meta} noun="users" onPage={setPage} />
        </>
      )}
    </div>
  );
}
