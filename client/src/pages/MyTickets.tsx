import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listTickets, fetchCategories, Category } from "../api";
import { useRequester } from "../contexts/RequesterContext";

export function formatBangkok(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;

  return `${value("year")}-${value("month")}-${value("day")} ${value("hour")}:${value("minute")}:${value("second")}`;
}

function PriorityBadge({ value }: { value: string }) {
  const token = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(value) ? value.toLowerCase() : "low";
  return <span className={`badge badge-priority-${token}`}>{value}</span>;
}

function StatusBadge({ value }: { value: string }) {
  return <span className={`badge ${value === "NEW" ? "badge-status-new" : ""}`}>{value}</span>;
}

export default function MyTickets() {
  const { requester } = useRequester();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryError, setCategoryError] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [priority, setPriority] = useState("");
  const [currentStatus, setCurrentStatus] = useState("");
  const [sort, setSort] = useState("updatedAt");
  const [order, setOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [data, setData] = useState<Array<Record<string, unknown>>>([]);
  const [meta, setMeta] = useState<{ page: number; pageSize: number; totalCount: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const ticketRequestSequence = useRef(0);
  const categoryRequestSequence = useRef(0);

  const isFiltered = debouncedSearch !== "" || categoryId !== "" || priority !== "" || currentStatus !== "";
  const hasResettableState =
    search.trim() !== "" ||
    categoryId !== "" ||
    priority !== "" ||
    currentStatus !== "" ||
    sort !== "updatedAt" ||
    order !== "desc";

  // debounce search 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, categoryId, priority, currentStatus, sort, order, pageSize]);

  const loadCategories = async (requesterId: number) => {
    const requestSequence = ++categoryRequestSequence.current;
    setCategoryLoading(true);
    setCategoryError("");
    try {
      const nextCategories = await fetchCategories(requesterId);
      if (requestSequence === categoryRequestSequence.current) {
        setCategories(nextCategories);
      }
    } catch {
      if (requestSequence === categoryRequestSequence.current) {
        setCategoryError("Unable to load categories");
      }
    } finally {
      if (requestSequence === categoryRequestSequence.current) {
        setCategoryLoading(false);
      }
    }
  };

  useEffect(() => {
    categoryRequestSequence.current += 1;
    ticketRequestSequence.current += 1;
    setCategories([]);
    setCategoryId("");
    setSearch("");
    setDebouncedSearch("");
    setPriority("");
    setCurrentStatus("");
    setSort("updatedAt");
    setOrder("desc");
    setPage(1);
    setPageSize(10);
    setData([]);
    setMeta(null);
    setError("");
    if (requester) void loadCategories(requester.id);
    return () => {
      categoryRequestSequence.current += 1;
    };
  }, [requester?.id]);

  const load = async () => {
    if (!requester) return;
    const requestSequence = ++ticketRequestSequence.current;
    setLoading(true);
    setError("");
    try {
      const res = await listTickets({
        requesterId: requester.id,
        search: debouncedSearch || undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
        requestedPriority: priority || undefined,
        currentStatus: currentStatus || undefined,
        sort,
        order,
        page,
        pageSize,
      });
      if (requestSequence === ticketRequestSequence.current) {
        setData(res.data as Array<Record<string, unknown>>);
        setMeta(res.meta);
      }
    } catch (err: unknown) {
      const e = err as { body?: { error?: { message?: string } } };
      if (requestSequence === ticketRequestSequence.current) {
        setError(e.body?.error?.message ?? "Unable to connect to TokTickIT API");
      }
    } finally {
      if (requestSequence === ticketRequestSequence.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void load();
    return () => {
      ticketRequestSequence.current += 1;
    };
  }, [requester?.id, debouncedSearch, categoryId, priority, currentStatus, sort, order, page, pageSize]);

  if (!requester) return null;

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setCategoryId("");
    setPriority("");
    setCurrentStatus("");
    setSort("updatedAt");
    setOrder("desc");
    setPage(1);
  };

  const applySort = (field: "ticketNumber" | "ticketDate" | "requestedPriority" | "updatedAt") => {
    setPage(1);
    if (sort === field) {
      setOrder((current) => (current === "desc" ? "asc" : "desc"));
      return;
    }
    setSort(field);
    setOrder("desc");
  };

  const sortState = (field: "ticketNumber" | "ticketDate" | "requestedPriority" | "updatedAt") =>
    sort === field ? (order === "asc" ? "ascending" : "descending") : "none";

  const sortGlyph = (field: "ticketNumber" | "ticketDate" | "requestedPriority" | "updatedAt") =>
    sort === field ? (order === "asc" ? "↑" : "↓") : "↕";

  const openTicketFromContainer = (event: React.MouseEvent<HTMLElement>, ticketId: number) => {
    if ((event.target as HTMLElement).closest("a, button, input, select, textarea")) return;
    navigate(`/tickets/${ticketId}`);
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3 lab2-mobile-stack">
        <h2 className="h4 mb-0">My Tickets</h2>
        <div className="d-flex gap-2 lab2-mobile-stack">
          <button className="btn btn-outline-success" type="button" onClick={clearFilters} disabled={!hasResettableState}>
            Clear Filters
          </button>
          <Link className="btn btn-success btn-zen-primary" to="/create">
            Create Ticket
          </Link>
        </div>
      </div>

      {/* Toolbar */}
      <div className="card mb-3 p-3">
        <div className="row g-2">
          <div className="col-md-4">
            <label htmlFor="my-tickets-search" className="form-label lab2-toolbar-label">Search</label>
            <input
              id="my-tickets-search"
              className="form-control"
              placeholder="Search ticket number or summary…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="col-md-2">
            <label htmlFor="my-tickets-category" className="form-label lab2-toolbar-label">Category</label>
            <select id="my-tickets-category" className="form-select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={categoryLoading || categoryError !== ""}>
              <option value="">{categoryLoading ? "Loading categories…" : "All Categories"}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-2">
            <label htmlFor="my-tickets-priority" className="form-label lab2-toolbar-label">Requested Priority</label>
            <select id="my-tickets-priority" className="form-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">All Priorities</option>
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
          </div>
          <div className="col-md-2">
            <label htmlFor="my-tickets-status" className="form-label lab2-toolbar-label">Current Status</label>
            <select id="my-tickets-status" className="form-select" value={currentStatus} onChange={(e) => setCurrentStatus(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="NEW">NEW</option>
            </select>
          </div>
          <div className="col-md-2">
            <label htmlFor="my-tickets-page-size" className="form-label lab2-toolbar-label">Rows per page</label>
            <select id="my-tickets-page-size" className="form-select" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      </div>

      {categoryError && (
        <div className="alert alert-warning d-flex justify-content-between align-items-center" role="alert" aria-live="polite">
          <span>{categoryError}</span>
          <button className="btn btn-outline-success btn-sm" aria-label="Retry categories" onClick={() => void loadCategories(requester.id)}>
            Retry
          </button>
        </div>
      )}

      {loading && <p className="text-secondary">Loading tickets…</p>}

      {error && (
        <div className="alert alert-danger d-flex justify-content-between align-items-center" role="alert" aria-live="polite">
          <span>{error}</span>
          <button className="btn btn-outline-success btn-sm" onClick={load}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && data.length === 0 && !isFiltered && (
        <div className="alert alert-info text-center">
          <p className="mb-2">You have not created any tickets yet</p>
          <a className="btn btn-success btn-zen-primary btn-sm" href="/create">
            Create Ticket
          </a>
        </div>
      )}

      {!loading && !error && data.length === 0 && isFiltered && (
        <div className="alert alert-warning text-center">
          <p className="mb-2">No tickets match your search or filters</p>
          <button className="btn btn-outline-success btn-sm" onClick={clearFilters}>
            Clear Filters
          </button>
        </div>
      )}

      {!loading && !error && data.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="d-none d-md-block table-responsive">
            <table className="table table-hover align-middle lab2-ticket-table">
              <colgroup>
                <col className="lab2-col-ticket-number" />
                <col className="lab2-col-created" />
                <col className="lab2-col-summary" />
                <col className="lab2-col-category" />
                <col className="lab2-col-priority" />
                <col className="lab2-col-status" />
                <col className="lab2-col-updated" />
              </colgroup>
              <thead>
                <tr>
                  <th aria-sort={sortState("ticketNumber")}>
                    <button
                      type="button"
                      className="btn btn-link p-0 text-decoration-none lab2-sort-button"
                      aria-label={`Sort by Ticket Number${sort === "ticketNumber" ? `, currently ${sortState("ticketNumber")}` : ""}`}
                      onClick={() => applySort("ticketNumber")}
                    >
                      <span className="lab2-sort-label">Ticket Number</span>
                      <span className="lab2-sort-glyph" aria-hidden="true">{sortGlyph("ticketNumber")}</span>
                    </button>
                  </th>
                  <th aria-sort={sortState("ticketDate")}>
                    <button
                      type="button"
                      className="btn btn-link p-0 text-decoration-none lab2-sort-button"
                      aria-label={`Sort by Created${sort === "ticketDate" ? `, currently ${sortState("ticketDate")}` : ""}`}
                      onClick={() => applySort("ticketDate")}
                    >
                      <span className="lab2-sort-label">Created</span>
                      <span className="lab2-sort-glyph" aria-hidden="true">{sortGlyph("ticketDate")}</span>
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
                      <span className="lab2-sort-label">Requested Priority</span>
                      <span className="lab2-sort-glyph" aria-hidden="true">{sortGlyph("requestedPriority")}</span>
                    </button>
                  </th>
                  <th>Current Status</th>
                  <th aria-sort={sortState("updatedAt")}>
                    <button
                      type="button"
                      className="btn btn-link p-0 text-decoration-none lab2-sort-button"
                      aria-label={`Sort by Last Updated${sort === "updatedAt" ? `, currently ${sortState("updatedAt")}` : ""}`}
                      onClick={() => applySort("updatedAt")}
                    >
                      <span className="lab2-sort-label">Last Updated</span>
                      <span className="lab2-sort-glyph" aria-hidden="true">{sortGlyph("updatedAt")}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((t) => (
                  <tr
                    key={t.id as number}
                    className="lab2-ticket-row"
                    onClick={(event) => openTicketFromContainer(event, t.id as number)}
                  >
                    <td>
                      <Link className="fw-semibold text-success" to={`/tickets/${t.id as number}`}>
                        {t.ticketNumber as string}
                      </Link>
                    </td>
                    <td className="lab2-date-cell">{t.ticketDate ? formatBangkok(t.ticketDate as string) : "—"}</td>
                    <td className="lab2-summary-cell">
                      <div className="lab2-summary-clamp">{t.summary as string}</div>
                    </td>
                    <td className="lab2-category-cell">{(t.category as { name: string })?.name}</td>
                    <td>
                      <PriorityBadge value={t.requestedPriority as string} />
                    </td>
                    <td>
                      <StatusBadge value={(t.currentStatus as string) ?? "NEW"} />
                    </td>
                    <td className="lab2-date-cell">{formatBangkok(t.updatedAt as string)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="d-md-none">
            <div className="d-flex flex-wrap gap-2 mb-2" role="group" aria-label="Mobile ticket sorting">
              {([
                ["ticketNumber", "Ticket Number"],
                ["ticketDate", "Created"],
                ["requestedPriority", "Requested Priority"],
                ["updatedAt", "Last Updated"],
              ] as const).map(([field, label]) => (
                <button
                  key={field}
                  type="button"
                  className={`btn btn-sm ${sort === field ? "btn-success" : "btn-outline-success"}`}
                  aria-label={`Sort mobile by ${label}${sort === field ? `, currently ${sortState(field)}` : ""}`}
                  aria-pressed={sort === field}
                  onClick={() => applySort(field)}
                >
                  {label} <span aria-hidden="true">{sortGlyph(field)}</span>
                </button>
              ))}
            </div>
            {data.map((t) => (
              <div
                key={t.id as number}
                className="card mb-2 p-3 lab2-ticket-card lab2-ticket-row"
                onClick={(event) => openTicketFromContainer(event, t.id as number)}
              >
                <div className="fw-bold">
                  <Link className="text-success" to={`/tickets/${t.id as number}`}>
                    {t.ticketNumber as string}
                  </Link>
                </div>
                <div className="small text-secondary">Created: {t.ticketDate ? formatBangkok(t.ticketDate as string) : "—"}</div>
                <div>{t.summary as string}</div>
                <div className="small text-secondary">
                  {(t.category as { name: string })?.name} • <PriorityBadge value={t.requestedPriority as string} /> •{" "}
                  <StatusBadge value={(t.currentStatus as string) ?? "NEW"} />
                </div>
                <div className="small text-secondary">Last Updated: {formatBangkok(t.updatedAt as string)}</div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {meta && meta.totalPages > 0 && (
            <nav className="d-flex justify-content-between align-items-center mt-3 lab2-pagination" aria-label="Pagination">
              <span className="text-secondary small">
                Page {meta.page} of {meta.totalPages} • {meta.totalCount} tickets
              </span>
              <div className="btn-group" role="group" aria-label="Pagination controls">
                <button className="btn btn-outline-secondary btn-sm" disabled={!meta.hasPreviousPage} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Previous page">
                  Previous
                </button>
                {(() => {
                  const pages: (number | string)[] = [];
                  const total = meta.totalPages;
                  const cur = meta.page;
                  const windowSize = 2;
                  // Always show first page
                  pages.push(1);
                  const start = Math.max(2, cur - windowSize);
                  const end = Math.min(total - 1, cur + windowSize);
                  if (start > 2) pages.push("…");
                  for (let i = start; i <= end; i++) pages.push(i);
                  if (end < total - 1) pages.push("…");
                  if (total > 1) pages.push(total);
                  // dedupe when total small
                  const uniq = [...new Set(pages)];
                  // filter out duplicate ellipsis already handled
                  return uniq.map((p, idx) =>
                    typeof p === "string" ? (
                      <span key={`ellipsis-${idx}`} className="btn btn-outline-secondary btn-sm disabled">
                        {p}
                      </span>
                    ) : (
                      <button
                        key={p}
                        className={`btn btn-sm ${p === cur ? "btn-success" : "btn-outline-secondary"}`}
                        aria-label={`Go to page ${p}`}
                        aria-current={p === cur ? "page" : undefined}
                        onClick={() => setPage(p)}
                        disabled={p === cur}
                      >
                        {p}
                      </button>
                    )
                  );
                })()}
                <button className="btn btn-outline-secondary btn-sm" disabled={!meta.hasNextPage} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                  Next
                </button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
