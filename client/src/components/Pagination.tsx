import { TicketListMeta } from "../api.js";

// Shared list pagination (Lab 2 requester pattern, reused by Staff Queue
// and Admin User Management): Previous + numbered window + Next with
// correct disabled states. Page changes flow through onPage; data fetching
// stays with the caller.
export default function Pagination({
  meta,
  noun,
  onPage,
}: {
  meta: TicketListMeta;
  noun: string;
  onPage: (page: number) => void;
}) {
  if (meta.totalPages <= 0) return null;
  return (
    <nav className="d-flex justify-content-between align-items-center mt-3 lab2-pagination" aria-label="Pagination">
      <span className="text-secondary small">
        Page {meta.page} of {meta.totalPages} • {meta.totalCount} {noun}
      </span>
      <div className="btn-group" role="group" aria-label="Pagination controls">
        <button
          className="btn btn-outline-secondary btn-sm"
          disabled={!meta.hasPreviousPage}
          onClick={() => onPage(Math.max(1, meta.page - 1))}
          aria-label="Previous page"
        >
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
                onClick={() => onPage(p)}
                disabled={p === cur}
              >
                {p}
              </button>
            ),
          );
        })()}
        <button
          className="btn btn-outline-secondary btn-sm"
          disabled={!meta.hasNextPage}
          onClick={() => onPage(meta.page + 1)}
          aria-label="Next page"
        >
          Next
        </button>
      </div>
    </nav>
  );
}
