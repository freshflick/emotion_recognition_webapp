import { ChevronLeft, ChevronRight } from "lucide-react";

export function SessionPagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}) {
  const pageCount = Math.ceil(totalItems / pageSize);
  if (pageCount <= 1) return null;

  const firstItem = (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, totalItems);

  return (
    <nav
      aria-label="Session pages"
      className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3"
      style={{ borderColor: "var(--border)" }}
    >
      <span className="text-xs text-muted-foreground" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
        Showing {firstItem}–{lastItem} of {totalItems}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex size-8 items-center justify-center border text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          style={{ borderColor: "var(--border)" }}
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="min-w-16 text-center text-xs tabular-nums text-muted-foreground" aria-live="polite">
          {page} / {pageCount}
        </span>
        <button
          type="button"
          aria-label="Next page"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
          className="inline-flex size-8 items-center justify-center border text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          style={{ borderColor: "var(--border)" }}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </nav>
  );
}
