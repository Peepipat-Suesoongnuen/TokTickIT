import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
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
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryError, setCategoryError] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [priority, setPriority] = useState("");
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

  const isFiltered = debouncedSearch !== "" || categoryId !== "" || priority !== "";

  // debounce search 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, categoryId, priority, sort, order, pageSize]);

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
  }, [requester?.id, debouncedSearch, categoryId, priority, sort, order, page, pageSize]);

  if (!requester) return null;

  const clearFilters = () => {
    setSearch("");
    setCategoryId("");
    setPriority("");
    setSort("updatedAt");
    setOrder("desc");
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3 lab2-mobile-stack">
        <h2 className="h4 mb-0">My Tickets</h2>
        <a className="btn btn-success btn-zen-primary" href="/create">
          Create Ticket
        </a>
      </div>

      {/* Toolbar */}
      <div className="card mb-3 p-3">
        <div className="row g-2">
          <div className="col-md-4">
            <input
              className="form-control"
              placeholder="Search summary or description…"
              aria-label="Search tickets"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="col-md-2">
            <select className="form-select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category" disabled={categoryLoading || categoryError !== ""}>
              <option value="">{categoryLoading ? "Loading categories…" : "All Categories"}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-2">
            <select className="form-select" value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
              <option value="">All Priorities</option>
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
          </div>
          <div className="col-md-2">
            <select className="form-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort field">
              <option value="updatedAt">Last Updated</option>
              <option value="ticketDate">Ticket Date</option>
              <option value="requestedPriority">Priority</option>
            </select>
          </div>
          <div className="col-md-1">
            <select className="form-select" value={order} onChange={(e) => setOrder(e.target.value)} aria-label="Sort order">
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
          </div>
          <div className="col-md-1">
            <select className="form-select" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Page size">
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
        {isFiltered && (
          <button className="btn btn-outline-success btn-sm mt-2" onClick={clearFilters}>
            Clear Filters
          </button>
        )}
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
            <table className="table table-hover align-middle">
              <thead>
                <tr>
                  <th>Ticket Number</th>
                  <th>Summary</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Last Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.map((t) => (
                  <tr key={t.id as number}>
                    <td>{t.ticketNumber as string}</td>
                    <td>{t.summary as string}</td>
                    <td>{(t.category as { name: string })?.name}</td>
                    <td>
                      <PriorityBadge value={t.requestedPriority as string} />
                    </td>
                    <td>
                      <StatusBadge value={(t.currentStatus as string) ?? "NEW"} />
                    </td>
                    <td>{formatBangkok(t.updatedAt as string)}</td>
                    <td>
                      <Link className="btn btn-outline-success btn-sm" to={`/tickets/${t.id as number}`}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="d-md-none">
            {data.map((t) => (
              <div key={t.id as number} className="card mb-2 p-3 lab2-ticket-card">
                <div className="fw-bold">{t.ticketNumber as string}</div>
                <div>{t.summary as string}</div>
                <div className="small text-secondary">
                  {(t.category as { name: string })?.name} • <PriorityBadge value={t.requestedPriority as string} /> •{" "}
                  <StatusBadge value={(t.currentStatus as string) ?? "NEW"} />
                </div>
                <div className="small text-secondary">{formatBangkok(t.updatedAt as string)}</div>
                <Link className="btn btn-outline-success btn-sm mt-2" to={`/tickets/${t.id as number}`}>
                  Open
                </Link>
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
