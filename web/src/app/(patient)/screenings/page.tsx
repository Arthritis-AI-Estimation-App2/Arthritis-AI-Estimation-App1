import { getScreeningsForStaff } from "@/app/actions/screenings";
import NavigationHint from "@/components/ui/NavigationHint";
import PaginationNav from "@/components/PaginationNav";
import StatusBadge from "@/components/StatusBadge";
import { Card, CardContent } from "@/components/ui/Card";
import { formatJapanDateTime } from "@/lib/japan-date-time";
import {
  SCREENING_STATUS_OPTIONS,
  formatScreeningId,
} from "@/lib/admin-screening-filters";
import {
  normalizeStaffScreeningFilters,
  staffScreeningListHref,
} from "@/lib/staff-screening-filters";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata = { title: "撮影記録 | 関節炎スクリーニング" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function StaffScreeningsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const rawParams = await searchParams;
  const filters = normalizeStaffScreeningFilters({
    from: firstValue(rawParams.from),
    to: firstValue(rawParams.to),
    status: firstValue(rawParams.status),
    subject: firstValue(rawParams.subject),
    id: firstValue(rawParams.id),
    page: firstValue(rawParams.page),
  });
  const { items, total, page, pageSize, totalPages } =
    await getScreeningsForStaff(filters);

  if (filters.page > totalPages) {
    redirect(staffScreeningListHref(filters, totalPages));
  }
  if (
    (filters.screeningId || filters.screeningIdPrefix) &&
    !filters.dateFrom &&
    !filters.dateTo &&
    !filters.status &&
    !filters.subjectId &&
    total === 1 &&
    items[0]
  ) {
    redirect(`/results/${items[0].id}`);
  }

  const hasFilters = Boolean(
    filters.dateFrom ||
      filters.dateTo ||
      filters.status ||
      filters.subjectId ||
      filters.screeningIdInput
  );
  const invalidDateRange = Boolean(
    filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo
  );
  const invalidScreeningId = Boolean(
    filters.screeningIdInput && !filters.screeningId && !filters.screeningIdPrefix
  );
  const activeFilterCount = [
    filters.dateFrom,
    filters.dateTo,
    filters.status,
    filters.subjectId,
    filters.screeningIdInput,
  ].filter(Boolean).length;
  const firstResult = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastResult = Math.min(page * pageSize, total);

  const filterForm = (
    <>
      <form method="get" className="grid items-end gap-2 sm:grid-cols-2">
        <label className="min-w-0 text-xs font-medium text-muted-foreground sm:col-span-2">
          撮影ID
          <input
            type="search"
            name="id"
            defaultValue={filters.screeningIdInput}
            placeholder="例: 09c6191d"
            spellCheck={false}
            autoComplete="off"
            aria-invalid={invalidScreeningId || undefined}
            className="mt-1 block h-9 w-full min-w-0 rounded-md border border-border-strong bg-surface px-2 py-1.5 font-mono text-sm text-foreground placeholder:font-sans placeholder:text-subtle-foreground"
          />
        </label>

        <label className="min-w-0 text-xs font-medium text-muted-foreground">
          撮影日（開始）
          <input
            type="date"
            name="from"
            defaultValue={filters.dateFrom}
            className="mt-1 block h-9 w-full min-w-0 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-foreground"
          />
        </label>

        <label className="min-w-0 text-xs font-medium text-muted-foreground">
          撮影日（終了）
          <input
            type="date"
            name="to"
            defaultValue={filters.dateTo}
            className="mt-1 block h-9 w-full min-w-0 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-foreground"
          />
        </label>

        <label className="min-w-0 text-xs font-medium text-muted-foreground">
          解析ステータス
          <select
            name="status"
            defaultValue={filters.status}
            className="mt-1 block h-9 w-full min-w-0 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-foreground"
          >
            <option value="">すべて</option>
            {SCREENING_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-0 text-xs font-medium text-muted-foreground">
          被験者ID
          <input
            type="search"
            name="subject"
            defaultValue={filters.subjectId}
            placeholder="例: keio1"
            className="mt-1 block h-9 w-full min-w-0 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-foreground placeholder:text-subtle-foreground"
          />
        </label>

        <div className="flex min-h-9 items-center gap-2 sm:col-span-2">
          <button
            type="submit"
            className="inline-flex h-9 shrink-0 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            絞り込む
          </button>
          {hasFilters && (
            <Link
              href="/screenings"
              className="inline-flex h-9 shrink-0 items-center rounded-md px-2 text-xs font-medium text-secondary-foreground hover:bg-surface-hover"
            >
              条件をクリア
            </Link>
          )}
        </div>
      </form>
      {invalidDateRange && (
        <p className="mt-2 text-sm font-medium text-danger-foreground" role="alert">
          撮影日の開始日は、終了日以前の日付を指定してください。
        </p>
      )}
      {invalidScreeningId && (
        <p className="mt-2 text-sm font-medium text-danger-foreground" role="alert">
          撮影IDは先頭から8文字以上のUUIDで入力してください。
        </p>
      )}
    </>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">撮影記録</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          所属医療機関の撮影記録です。割り当て済みも含めて、被験者IDや撮影IDで探せます。
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface">
        <details
          className="group"
          {...(invalidDateRange || invalidScreeningId ? { open: true } : {})}
        >
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium text-secondary-foreground marker:content-none hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus [&::-webkit-details-marker]:hidden">
            <span>絞り込み</span>
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-primary-subtle px-2 py-0.5 text-xs font-medium text-primary-subtle-foreground">
                {activeFilterCount}項目を適用中
              </span>
            )}
            <svg
              aria-hidden="true"
              className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
            </svg>
          </summary>
          <div className="border-t border-border px-3 py-3">{filterForm}</div>
        </details>
      </div>

      <Card>
        <CardContent className="p-0">
          <p className="px-5 pt-4 text-sm text-secondary-foreground">
            {total}件中 {firstResult}〜{lastResult}件を表示
          </p>
          {items.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              {hasFilters
                ? "条件に一致する撮影記録はありません。"
                : "まだ撮影記録がありません"}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border border-t border-border">
              {items.map((screening) => (
                <li key={screening.id}>
                  <Link
                    href={`/results/${screening.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
                  >
                    <div className="min-w-0 space-y-1">
                      {screening.subject_id ? (
                        <p className="font-mono text-sm text-foreground">
                          {screening.subject_id}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">未割り当て</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {formatJapanDateTime(screening.created_at)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        撮影ID {formatScreeningId(screening.id)}
                      </p>
                      {screening.status === "failed" && (
                        <p className="text-xs text-danger-foreground">
                          再撮影するか、詳細から次の操作を確認
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        <StatusBadge status={screening.status} />
                        {screening.status === "completed" && (
                          <span className="whitespace-nowrap text-xs font-medium text-secondary-foreground">
                            陽性関節数: {screening.total_inflamed_joints}箇所
                          </span>
                        )}
                      </div>
                    </div>
                    <NavigationHint>詳細</NavigationHint>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="px-5 pb-4">
            <PaginationNav
              page={page}
              totalPages={totalPages}
              pathname="/screenings"
              params={{
                from: filters.dateFrom,
                to: filters.dateTo,
                status: filters.status,
                subject: filters.subjectId,
                id: filters.screeningIdInput,
              }}
              ariaLabel="撮影記録一覧のページ移動"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
