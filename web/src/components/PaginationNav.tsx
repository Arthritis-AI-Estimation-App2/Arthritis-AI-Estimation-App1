import Link from "@/components/ui/Link";
import { paginatedListHref } from "@/lib/staff-pagination";

interface Props {
  page: number;
  totalPages: number;
  pathname: string;
  params?: Record<string, string | undefined>;
  ariaLabel: string;
}

export default function PaginationNav({
  page,
  totalPages,
  pathname,
  params,
  ariaLabel,
}: Props) {
  if (totalPages <= 1) return null;

  return (
    <nav
      className="mt-5 flex items-center justify-between border-t border-border pt-4"
      aria-label={ariaLabel}
    >
      {page > 1 ? (
        <Link
          href={paginatedListHref(pathname, page - 1, params)}
          className="rounded-lg border border-border-strong px-3 py-2 text-sm font-medium text-secondary-foreground hover:bg-surface-hover"
        >
          ← 前へ
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-secondary-foreground">
        {page} / {totalPages}ページ
      </span>
      {page < totalPages ? (
        <Link
          href={paginatedListHref(pathname, page + 1, params)}
          className="rounded-lg border border-border-strong px-3 py-2 text-sm font-medium text-secondary-foreground hover:bg-surface-hover"
        >
          次へ →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
