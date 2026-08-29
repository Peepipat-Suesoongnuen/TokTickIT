import { useEffect, useState } from "react";
import { listTickets, fetchCategories, Category } from "../api";
import { useRequester } from "../contexts/RequesterContext";

function formatBangkok(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleString("en-CA", { timeZone: "Asia/Bangkok", hour12: false }).replace(",", "");
  } catch {
    return dateStr;
  }
}

function PriorityBadge({ value }: { value: string }) {
  const map: Record<string, { bg: string; color: string; border?: string }> = {
    LOW: { bg: "#f8f9fa", color: "#495057", border: "1px solid #ced4da" },
    MEDIUM: { bg: "#EAF6EF", color: "#006B3C" },
    HIGH: { bg: "#fff3e0", color: "#e65100" },
    CRITICAL: { bg: "#ffebee", color: "#b71c1c" },
  };
  const s = map[value] ?? map.LOW;
  return <span className="badge" style={{ backgroundColor: s.bg, color: s.color, border: s.border ?? "none" }}>{value}</span>;
}

export default function MyTickets() {
  const { requester } = useRequester();
  const [categories, setCategories] = useState<Category[]>([]);
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

  useEffect(() => {
    if (!requester) {
      fetchCategories(1).catch(() => {}); // warm
      return;
    }
    fetchCategories(requester.id).then(setCategories).catch(() => {});
  }, [requester?.id]);

  const load = async () => {
    if (!requester) return;
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
      setData(res.data as Array<Record<string, unknown>>);
      setMeta(res.meta);
    } catch (err: unknown) {
      const e = err as { body?: { error?: { message?: string } } };
      setError(e.body?.error?.message ?? "Unable to connect to TokTickIT API");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
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
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 className="h4 mb-0">My Tickets</h2>
        <a className="btn btn-success" href="/create" style={{ backgroundColor: "#006B3C", borderColor: "#006B3C" }}>
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
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="col-md-2">
            <select className="form-select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-2">
            <select className="form-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">All Priorities</option>
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
          </div>
          <div className="col-md-2">
            <select className="form-select" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="updatedAt">Last Updated</option>
              <option value="ticketDate">Ticket Date</option>
              <option value="requestedPriority">Priority</option>
            </select>
          </div>
          <div className="col-md-1">
            <select className="form-select" value={order} onChange={(e) => setOrder(e.target.value)}>
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
          </div>
          <div className="col-md-1">
            <select className="form-select" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
        {(isFiltered || sort !== "updatedAt" || order !== "desc") && (
          <button className="btn btn-outline-secondary btn-sm mt-2" onClick={clearFilters}>
            Clear Filters
          </button>
        )}
      </div>

      {loading && <p className="text-secondary">Loading tickets…</p>}

      {error && (
        <div className="alert alert-danger d-flex justify-content-between align-items-center">
          <span>{error}</span>
          <button className="btn btn-outline-danger btn-sm" onClick={load}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && data.length === 0 && !isFiltered && (
        <div className="alert alert-info text-center">
          <p className="mb-2">You have not created any tickets yet</p>
          <a className="btn btn-success btn-sm" href="/create" style={{ backgroundColor: "#006B3C" }}>
            Create Ticket
          </a>
        </div>
      )}

      {!loading && !error && data.length === 0 && isFiltered && (
        <div className="alert alert-warning text-center">
          <p className="mb-2">No tickets match your search or filters</p>
          <button className="btn btn-outline-secondary btn-sm" onClick={clearFilters}>
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
                      <span className="badge" style={{ backgroundColor: "#EAF6EF", color: "#006B3C" }}>
                        {(t.currentStatus as string) ?? "NEW"}
                      </span>
                    </td>
                    <td>{formatBangkok(t.updatedAt as string)}</td>
                    <td>
                      <a className="btn btn-outline-success btn-sm" href={`/tickets/${t.id as number}`}>
                        Open
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="d-md-none">
            {data.map((t) => (
              <div key={t.id as number} className="card mb-2 p-3">
                <div className="fw-bold">{t.ticketNumber as string}</div>
                <div>{t.summary as string}</div>
                <div className="small text-secondary">
                  {(t.category as { name: string })?.name} • <PriorityBadge value={t.requestedPriority as string} /> •{" "}
                  <span className="badge" style={{ backgroundColor: "#EAF6EF", color: "#006B3C" }}>
                    {t.currentStatus as string}
                  </span>
                </div>
                <div className="small text-secondary">{formatBangkok(t.updatedAt as string)}</div>
                <a className="btn btn-outline-success btn-sm mt-2" href={`/tickets/${t.id as number}`}>
                  Open
                </a>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {meta && meta.totalPages > 0 && (
            <nav className="d-flex justify-content-between align-items-center mt-3">
              <span className="text-secondary small">
                Page {meta.page} of {meta.totalPages} • {meta.totalCount} tickets
              </span>
              <div className="btn-group">
                <button className="btn btn-outline-secondary btn-sm" disabled={!meta.hasPreviousPage} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Previous
                </button>
                <button className="btn btn-outline-secondary btn-sm" disabled={!meta.hasNextPage} onClick={() => setPage((p) => p + 1)}>
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
