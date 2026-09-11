import {
  getClinics,
  getScreeningsForAdmin,
} from "@/app/actions/admin";
import StatusBadge from "@/components/StatusBadge";
import { Card, CardContent } from "@/components/ui/Card";
import {
  SCREENING_STATUS_OPTIONS,
  adminScreeningExportHref,
  adminScreeningListHref,
  normalizeAdminScreeningFilters,
} from "@/lib/admin-screening-filters";
import { isStaleProcessing } from "@/lib/screening-staleness";
import { formatJapanDateTime } from "@/lib/japan-date-time";
import Link from "next/link";
import { redirect } from "next/navigation";

type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function singleRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminScreeningsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const rawParams = await searchParams;
  const filters = normalizeAdminScreeningFilters({
    clinic: firstValue(rawParams.clinic),
    from: firstValue(rawParams.from),
    to: firstValue(rawParams.to),
    status: firstValue(rawParams.status),
    subject: firstValue(rawParams.subject),
    page: firstValue(rawParams.page),
  });
  const [{ screenings, total, page, pageSize, totalPages }, clinics] =
    await Promise.all([getScreeningsForAdmin(filters), getClinics()]);

  if (filters.page > totalPages) {
    redirect(adminScreeningListHref(filters, totalPages));
  }

  const hasFilters = Boolean(
    filters.clinicId ||
      filters.dateFrom ||
      filters.dateTo ||
      filters.status ||
      filters.subjectId
  );
  const invalidDateRange = Boolean(
    filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo
  );
  const activeFilterCount = [
    filters.clinicId,
    filters.dateFrom,
    filters.dateTo,
    filters.status,
    filters.subjectId,
  ].filter(Boolean).length;
  const firstResult = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastResult = Math.min(page * pageSize, total);

  const filterForm = (
    <>
      <form method="get" className="mt-3 grid items-end gap-3 sm:grid-cols-2 lg:mt-0 lg:grid-cols-3 xl:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
        <label className="min-w-0 text-xs font-medium text-muted-foreground">
          医療機関
          <select
            name="clinic"
            defaultValue={filters.clinicId}
            className="mt-1 block h-10 w-full min-w-0 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-foreground lg:h-9"
          >
            <option value="">すべて</option>
            {clinics.map((clinic) => (
              <option key={clinic.id} value={clinic.id}>
                {clinic.name}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-0 text-xs font-medium text-muted-foreground">
          撮影日（開始）
          <input
            type="date"
            name="from"
            defaultValue={filters.dateFrom}
            className="mt-1 block h-10 w-full min-w-0 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-foreground lg:h-9"
          />
        </label>

        <label className="min-w-0 text-xs font-medium text-muted-foreground">
          撮影日（終了）
          <input
            type="date"
            name="to"
            defaultValue={filters.dateTo}
            className="mt-1 block h-10 w-full min-w-0 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-foreground lg:h-9"
          />
        </label>

        <label className="min-w-0 text-xs font-medium text-muted-foreground">
          解析ステータス
          <select
            name="status"
            defaultValue={filters.status}
            className="mt-1 block h-10 w-full min-w-0 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-foreground lg:h-9"
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
            placeholder="例: keio47"
            className="mt-1 block h-10 w-full min-w-0 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-foreground lg:h-9 placeholder:text-subtle-foreground"
          />
        </label>

        <div className="flex min-h-10 items-center gap-2 lg:min-h-9">
          <button
            type="submit"
            className="inline-flex h-10 shrink-0 items-center rounded-md bg-primary px-3 text-sm lg:h-9 font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            絞り込む
          </button>
          {hasFilters && (
            <Link
              href="/admin/screenings"
              className="inline-flex h-10 shrink-0 items-center rounded-md px-2 text-xs font-medium text-secondary-foreground hover:bg-surface-hover lg:h-9"
            >
              条件をクリア
            </Link>
          )}
        </div>
      </form>
      {invalidDateRange && (
        <p className="mt-3 text-sm font-medium text-danger-foreground" role="alert">
          撮影日の開始日は、終了日以前の日付を指定してください。
        </p>
      )}
    </>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          全医療機関の撮影・解析データ
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          契約中のすべての医療機関で撮影された画像およびAI解析結果の一覧です。
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-3">
        <details
          className="group lg:hidden"
          open={hasFilters || invalidDateRange}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-1 py-1 text-sm font-semibold text-secondary-foreground marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
            <span>絞り込み条件</span>
            <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-primary-subtle px-2 py-0.5 text-primary-subtle-foreground">
                  {activeFilterCount}件を適用中
                </span>
              )}
              <svg
                aria-hidden="true"
                className="h-4 w-4 transition-transform group-open:rotate-180"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
              </svg>
            </span>
          </summary>

          {filterForm}
        </details>
        <div className="hidden lg:block">{filterForm}</div>
      </div>

      <Card>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-secondary-foreground">
              {total}件中 {firstResult}〜{lastResult}件を表示
            </p>
            <div className="flex items-center gap-3">
              <p className="text-xs text-muted-foreground">1ページあたり{pageSize}件</p>
              {total > 0 && (
                <a
                  href={adminScreeningExportHref(filters)}
                  className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm font-medium text-secondary-foreground hover:bg-surface-hover"
                >
                  CSV出力
                </a>
              )}
            </div>
          </div>

          {screenings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {hasFilters
                ? "条件に一致する撮影データはありません。"
                : "撮影データはありません。"}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-secondary-foreground">
                <thead className="border-b bg-surface-muted text-xs font-semibold uppercase text-secondary-foreground">
                  <tr>
                    <th className="px-4 py-3">医療機関</th>
                    <th className="px-4 py-3">被験者ID</th>
                    <th className="px-4 py-3">撮影日時</th>
                    <th className="px-4 py-3">担当スタッフ</th>
                    <th className="px-4 py-3">解析ステータス</th>
                    <th className="px-4 py-3">炎症数</th>
                    <th className="px-4 py-3">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {screenings.map((s) => {
                    const subject = singleRelation(s.subjects);
                    const profile = singleRelation(s.profiles);
                    const subjectClinic = singleRelation(subject?.clinics);
                    const staffClinic = singleRelation(profile?.clinics);
                    const clinicName =
                      subjectClinic?.name ?? staffClinic?.name ?? "未割り当て";
                    const subjectId = s.subject_id ?? "未割当";
                    const staffName = profile?.full_name ?? "不明";
                    const isInterrupted = isStaleProcessing(
                      s.status,
                      s.status_updated_at
                    );

                    return (
                      <tr key={s.id} className="hover:bg-surface-hover">
                        <td className="px-4 py-3 font-medium text-foreground">
                          {clinicName}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs tracking-tight">
                          {subjectId}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {formatJapanDateTime(s.created_at)}
                        </td>
                        <td className="px-4 py-3 text-xs">{staffName}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={s.status} />
                          {isInterrupted && (
                            <p className="mt-1 text-xs font-medium text-warning-foreground">
                              中断の可能性
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {s.status === "completed"
                            ? `${s.total_inflamed_joints ?? 0} 箇所`
                            : "-"}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/screenings/${s.id}`}
                            className="text-xs font-semibold text-link hover:underline"
                          >
                            結果を見る →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <nav
              className="mt-5 flex items-center justify-between border-t border-border pt-4"
              aria-label="解析結果一覧のページ移動"
            >
              {page > 1 ? (
                <Link
                  href={adminScreeningListHref(filters, page - 1)}
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
                  href={adminScreeningListHref(filters, page + 1)}
                  className="rounded-lg border border-border-strong px-3 py-2 text-sm font-medium text-secondary-foreground hover:bg-surface-hover"
                >
                  次へ →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
