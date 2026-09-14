import NavigationHint from "@/components/ui/NavigationHint";
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
import { staffDisplayName } from "@/lib/staff-display-name";
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
    id: firstValue(rawParams.id),
    page: firstValue(rawParams.page),
  });
  const [{ screenings, total, page, pageSize, totalPages }, clinics] =
    await Promise.all([getScreeningsForAdmin(filters), getClinics()]);

  if (filters.page > totalPages) {
    redirect(adminScreeningListHref(filters, totalPages));
  }
  if (
    (filters.screeningId || filters.screeningIdPrefix) &&
    !filters.clinicId &&
    !filters.dateFrom &&
    !filters.dateTo &&
    !filters.status &&
    !filters.subjectId &&
    total === 1 &&
    screenings[0]
  ) {
    redirect(`/admin/screenings/${screenings[0].id}`);
  }

  const hasFilters = Boolean(
    filters.clinicId ||
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
    filters.clinicId,
    filters.dateFrom,
    filters.dateTo,
    filters.status,
    filters.subjectId,
    filters.screeningIdInput,
  ].filter(Boolean).length;
  const firstResult = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastResult = Math.min(page * pageSize, total);

  const rows = screenings.map((s) => {
    const subject = singleRelation(s.subjects);
    const profile = singleRelation(s.profiles);
    const subjectClinic = singleRelation(subject?.clinics);
    const staffClinic = singleRelation(profile?.clinics);

    return {
      id: s.id,
      href: `/admin/screenings/${s.id}`,
      clinicName: subjectClinic?.name ?? staffClinic?.name ?? "未割り当て",
      subjectId: s.subject_id ?? "未割り当て",
      staffName: staffDisplayName(profile),
      status: s.status,
      capturedAt: formatJapanDateTime(s.created_at),
      inflamedLabel:
        s.status === "completed" ? `${s.total_inflamed_joints ?? 0} 箇所` : "-",
      isInterrupted: isStaleProcessing(s.status, s.status_updated_at),
    };
  });

  const filterForm = (
    <>
      <form method="get" className="grid items-end gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <label className="min-w-0 text-xs font-medium text-muted-foreground sm:col-span-2 lg:col-span-3">
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
          医療機関
          <select
            name="clinic"
            defaultValue={filters.clinicId}
            className="mt-1 block h-9 w-full min-w-0 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-foreground"
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
            placeholder="例: keio47"
            className="mt-1 block h-9 w-full min-w-0 rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-foreground placeholder:text-subtle-foreground"
          />
        </label>

        <div className="flex min-h-9 items-center gap-2">
          <button
            type="submit"
            className="inline-flex h-9 shrink-0 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            絞り込む
          </button>
          {hasFilters && (
            <Link
              href="/admin/screenings"
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
        <h1 className="text-2xl font-bold text-foreground">
          全医療機関の撮影記録
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          契約中のすべての医療機関の撮影記録とAI解析結果の一覧です。
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
                {activeFilterCount}件を適用中
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
                ? "条件に一致する撮影記録はありません。"
                : "撮影記録はありません。"}
            </p>
          ) : (
            <>
              <ul className="-mx-5 divide-y divide-border border-y border-border lg:hidden">
                {rows.map((row) => (
                  <li key={row.id}>
                    <Link
                      href={row.href}
                      className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-surface-hover"
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="truncate font-medium text-foreground">
                          {row.clinicName}
                        </p>
                        <p className="font-mono text-xs tracking-tight text-secondary-foreground">
                          被験者ID: {row.subjectId}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {row.capturedAt} / 担当: {row.staffName}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                          <StatusBadge status={row.status} />
                          {row.status === "completed" && (
                            <span className="text-xs text-secondary-foreground">
                              陽性関節数: {row.inflamedLabel}
                            </span>
                          )}
                        </div>
                        {row.isInterrupted && (
                          <p className="text-xs font-medium text-warning-foreground">
                            中断の可能性
                          </p>
                        )}
                      </div>
                      <NavigationHint>詳細</NavigationHint>
                    </Link>
                  </li>
                ))}
              </ul>

              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full text-left text-sm text-secondary-foreground">
                  <thead className="border-b bg-surface-muted text-xs font-semibold uppercase text-secondary-foreground">
                    <tr>
                      <th className="px-4 py-3">医療機関</th>
                      <th className="px-4 py-3">被験者ID</th>
                      <th className="px-4 py-3">撮影日時</th>
                      <th className="px-4 py-3">担当スタッフ</th>
                      <th className="px-4 py-3">解析ステータス</th>
                      <th className="px-4 py-3">陽性関節数</th>
                      <th className="px-4 py-3"><span className="sr-only">詳細</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((row) => (
                      <tr key={row.id} className="relative transition-colors hover:bg-surface-hover">
                        <td className="px-4 py-3 font-medium text-foreground">
                          {row.clinicName}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs tracking-tight">
                          {row.subjectId}
                        </td>
                        <td className="px-4 py-3 text-xs">{row.capturedAt}</td>
                        <td className="px-4 py-3 text-xs">{row.staffName}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={row.status} />
                          {row.isInterrupted && (
                            <p className="mt-1 text-xs font-medium text-warning-foreground">
                              中断の可能性
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">{row.inflamedLabel}</td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={row.href}
                            aria-label={`被験者ID ${row.subjectId}、${row.capturedAt}の撮影記録の詳細を見る`}
                            className="after:absolute after:inset-0 after:z-10 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-focus"
                          >
                            <NavigationHint>詳細</NavigationHint>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
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
