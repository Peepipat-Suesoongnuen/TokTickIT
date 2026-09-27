import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  listStaffTickets,
  fetchCategories,
  listEligibleOwners,
  Category,
  EligibleOwner,
  StaffTicketQueueItem,
  TicketListMeta,
} from "../api";
import { PriorityBadge, StatusBadge } from "../components/Badges.js";
import Pagination from "../components/Pagination.js";
import { formatBangkok } from "./MyTickets.js";

const STATUSES = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
];

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

// Desktop-sortable columns (api-spec §8 allow-list subset shown with
// direction arrows like the approved mockup).
const SORTABLE = [
  ["ticketNumber", "Ticket No."],
  ["requestedPriority", "Req. Priority"],
  ["itPriority", "IT Priority"],
  ["updatedAt", "Updated"],
] as const;

type SortField = (typeof SORTABLE)[number][0];

function splitDateTime(dateStr: string): [string, string] {
  const formatted = formatBangkok(dateStr);
  const space = formatted.indexOf(" ");
  if (space < 0) return [formatted, ""];
  return [formatted.slice(0, space), formatted.slice(space + 1)];
}

export default function StaffQueue() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [owners, setOwners] = useState<EligibleOwner[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [requestedPriority, setRequestedPriority] = useState("");
  const [itPriority, setItPriority] = useState("");
  const [currentStatus, setCurrentStatus] = useState("");
  const [owner, setOwner] = useState("");
  const [sort, setSort] = useState<SortField | "">("");
  const [order, setOrder] = useState("desc");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const [data, setData] = useState<StaffTicketQueueItem[]>([]);
  const [meta, setMeta] = useState<TicketListMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const requestSequence = useRef(0);

  const isInitialLoading = loading && meta === null;
  const isFiltered =
    debouncedSearch !== "" ||
    categoryId !== "" ||
    requestedPriority !== "" ||
    itPriority !== "" ||
    currentStatus !== "" ||
    owner !== "";

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, categoryId, requestedPriority, itPriority, currentStatus, owner, sort, order, pageSize]);

  useEffect(() => {
    void fetchCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
    // Owner picker doubles as the queue Owner filter options (All /
    // Unassigned / My Tickets / eligible staff), mirroring the mockup.
    void listEligibleOwners()
      .then((res) => setOwners(res.data))
      .catch(() => setOwners([]));
  }, []);

  const load = async () => {
    const seq = ++requestSequence.current;
    setLoading(true);
    setError("");
    setForbidden(false);
    try {
      const res = await listStaffTickets({
        search: debouncedSearch || undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
        requestedPriority: requestedPriority || undefined,
        itPriority: itPriority || undefined,
        currentStatus: currentStatus || undefined,
        owner: owner || undefined,
        sort: sort || undefined,
        order: sort ? order : undefined,
        page,
        pageSize,
      });
      if (seq === requestSequence.current) {
        setData(res.data);
        setMeta(res.meta);
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
  }, [debouncedSearch, categoryId, requestedPriority, itPriority, currentStatus, owner, sort, order, page, pageSize]);

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setCategoryId("");
    setRequestedPriority("");
    setItPriority("");
    setCurrentStatus("");
    setOwner("");
    setSort("");
    setOrder("desc");
    setPage(1);
  };

  const applySort = (field: SortField) => {
    setPage(1);
    if (sort === field) {
      setOrder((current) => (current === "desc" ? "asc" : "desc"));
      return;
    }
    setSort(field);
    setOrder("desc");
  };

  // Same sort-indicator language as Requester My Tickets (reference):
  // active column shows ↑/↓, inactive sortable columns show ↕.
  const sortState = (field: SortField) =>
    sort === field ? (order === "asc" ? "ascending" : "descending") : "none";

  const sortGlyph = (field: SortField) =>
    sort === field ? (order === "asc" ? "↑" : "↓") : "↕";

  const openTicketFromContainer = (event: React.MouseEvent<HTMLElement>, ticketId: number) => {
    if ((event.target as HTMLElement).closest("a, button, input, select, textarea")) return;
    navigate(`/staff/tickets/${ticketId}`);
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3 lab2-mobile-stack">
        <h2 className="h4 mb-0">Ticket Queue</h2>
        <div className="d-flex gap-2 lab2-mobile-stack">
          <button className="btn btn-outline-success" type="button" onClick={clearFilters}>
            Clear Filters
          </button>
          <button className="btn btn-outline-success" type="button" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </div>

      <div className="card mb-3 p-3">
        <div className="lab3-staff-toolbar-grid" data-testid="staff-queue-toolbar">
          <div>
            <label htmlFor="staff-queue-search" className="form-label lab2-toolbar-label">Search</label>
            <input
              id="staff-queue-search"
              className="form-control"
              placeholder="Search ticket number, summary, or requester…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="staff-queue-category" className="form-label lab2-toolbar-label">Category</label>
            <select id="staff-queue-category" className="form-select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="staff-queue-req-priority" className="form-label lab2-toolbar-label">Requested Priority</label>
            <select id="staff-queue-req-priority" className="form-select" value={requestedPriority} onChange={(e) => setRequestedPriority(e.target.value)}>
              <option value="">All</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="staff-queue-it-priority" className="form-label lab2-toolbar-label">IT Priority</label>
            <select id="staff-queue-it-priority" className="form-select" value={itPriority} onChange={(e) => setItPriority(e.target.value)}>
              <option value="">All</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="staff-queue-status" className="form-label lab2-toolbar-label">Current Status</label>
            <select id="staff-queue-status" className="form-select" value={currentStatus} onChange={(e) => setCurrentStatus(e.target.value)}>
              <option value="">All Statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="staff-queue-owner" className="form-label lab2-toolbar-label">Owner</label>
            <select id="staff-queue-owner" className="form-select" value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">All Owners</option>
              <option value="unassigned">Unassigned</option>
              <option value="me">My Tickets</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="staff-queue-page-size" className="form-label lab2-toolbar-label">Rows per page</label>
            <select id="staff-queue-page-size" className="form-select" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      </div>

      {isInitialLoading && <p className="text-secondary">Loading tickets…</p>}

      {forbidden && (
        <div className="alert alert-warning" role="alert">
          You do not have permission to view the Ticket Queue.
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
          <p className="mb-0">No tickets in the queue yet</p>
        </div>
      )}

      {!loading && !error && !forbidden && data.length === 0 && isFiltered && (
        <div className="alert alert-warning text-center" role="status">
          <p className="mb-2">No tickets match the current queue filters</p>
          <button className="btn btn-outline-success btn-sm" onClick={clearFilters}>
            Clear Filters
          </button>
        </div>
      )}

      {!error && !forbidden && data.length > 0 && (
        <>
          <div className="d-none d-md-block table-responsive">
            <table className="table table-hover align-middle lab2-ticket-table lab2-ticket-table-staff" aria-busy={loading}>
              <thead>
                <tr>
                  <th aria-sort={sortState("ticketNumber")}>
                    <button
                      type="button"
                      className="btn btn-link p-0 text-decoration-none lab2-sort-button"
                      aria-label={`Sort by Ticket Number${sort === "ticketNumber" ? `, currently ${sortState("ticketNumber")}` : ""}`}
                      onClick={() => applySort("ticketNumber")}
                    >
                      <span className="lab2-sort-label">Ticket No.</span>
                      <span className="lab2-sort-glyph" aria-hidden="true">{sortGlyph("ticketNumber")}</span>
                    </button>
                  </th>
                  <th>Summary</th>
                  <th>Category</th>
                  <th aria-sort={sortState("requestedPriority")}>
                    <button
                      type="button"
                      className="btn btn-link p-0 text-decoration-none lab2-sort-button"
                      aria-label={`Sort by Requested Priority${sort === "requestedPriority" ? `, currently ${sortState("requestedPriority")}` : ""}`}
                      onClick={() => applySort("requestedPriority")}
                    >
                      <span className="lab2-sort-label">Req. Priority</span>
                      <span className="lab2-sort-glyph" aria-hidden="true">{sortGlyph("requestedPriority")}</span>
                    </button>
                  </th>
                  <th aria-sort={sortState("itPriority")}>
                    <button
                      type="button"
                      className="btn btn-link p-0 text-decoration-none lab2-sort-button"
                      aria-label={`Sort by IT Priority${sort === "itPriority" ? `, currently ${sortState("itPriority")}` : ""}`}
                      onClick={() => applySort("itPriority")}
                    >
                      <span className="lab2-sort-label">IT Priority</span>
                      <span className="lab2-sort-glyph" aria-hidden="true">{sortGlyph("itPriority")}</span>
                    </button>
                  </th>
                  <th>Status</th>
                  <th>Owner</th>
                  <th aria-sort={sortState("updatedAt")}>
                    <button
                      type="button"
                      className="btn btn-link p-0 text-decoration-none lab2-sort-button"
                      aria-label={`Sort by Last Updated${sort === "updatedAt" ? `, currently ${sortState("updatedAt")}` : ""}`}
                      onClick={() => applySort("updatedAt")}
                    >
                      <span className="lab2-sort-label">Updated</span>
                      <span className="lab2-sort-glyph" aria-hidden="true">{sortGlyph("updatedAt")}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((t) => {
                  const [updatedDate, updatedTime] = splitDateTime(t.updatedAt);
                  return (
                    <tr key={t.id} className="lab2-ticket-row" onClick={(event) => openTicketFromContainer(event, t.id)}>
                      <td>
                        <Link className="fw-semibold text-success" to={`/staff/tickets/${t.id}`}>
                          {t.ticketNumber}
                        </Link>
                      </td>
                      <td className="lab2-summary-cell">
                        <div className="lab2-summary-clamp">{t.summary}</div>
                      </td>
                      <td className="lab2-category-cell">{t.category.name}</td>
                      <td>
                        <PriorityBadge value={t.requestedPriority} />
                      </td>
                      <td>
                        <PriorityBadge value={t.itPriority} />
                      </td>
                      <td>
                        <StatusBadge value={t.currentStatus} />
                      </td>
                      <td className="lab2-category-cell">{t.ticketOwner ? t.ticketOwner.name : "Unassigned"}</td>
                      <td className="lab2-date-cell">
                        {updatedDate}
                        <br />
                        {updatedTime}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="d-md-none" aria-busy={loading}>
            <div className="d-flex flex-wrap gap-2 mb-2" role="group" aria-label="Mobile ticket sorting">
              {SORTABLE.map(([field]) => {
                const mobileLabel =
                  field === "ticketNumber"
                    ? "Ticket Number"
                    : field === "requestedPriority"
                      ? "Requested Priority"
                      : field === "itPriority"
                        ? "IT Priority"
                        : "Last Updated";
                return (
                  <button
                    key={field}
                    type="button"
                    className={`btn btn-sm ${sort === field ? "btn-success" : "btn-outline-success"}`}
                    aria-label={`Sort mobile by ${mobileLabel}${sort === field ? `, currently ${order === "asc" ? "ascending" : "descending"}` : ""}`}
                    aria-pressed={sort === field}
                    onClick={() => applySort(field)}
                  >
                    {mobileLabel} <span aria-hidden="true">{sort === field ? (order === "asc" ? "↑" : "↓") : "↕"}</span>
                  </button>
                );
              })}
            </div>
            {data.map((t) => (
              <div key={t.id} className="card mb-2 p-3 lab2-ticket-card lab2-ticket-row" onClick={(event) => openTicketFromContainer(event, t.id)}>
                <div className="d-flex justify-content-between align-items-center">
                  <Link className="fw-bold text-success" to={`/staff/tickets/${t.id}`}>
                    {t.ticketNumber}
                  </Link>
                  <PriorityBadge value={t.itPriority} />
                </div>
                <div>{t.summary}</div>
                <div className="small text-secondary">
                  {t.category.name} • Requested: {t.requestedPriority}
                </div>
                <div className="small text-secondary">
                  Status: <StatusBadge value={t.currentStatus} /> • Owner: {t.ticketOwner ? t.ticketOwner.name : "Unassigned"}
                </div>
                <div className="small text-secondary">Updated: {formatBangkok(t.updatedAt)}</div>
              </div>
            ))}
          </div>

          {meta && <Pagination meta={meta} noun="tickets" onPage={setPage} />}
        </>
      )}
    </div>
  );
}
