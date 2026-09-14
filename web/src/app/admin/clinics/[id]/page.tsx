import NavigationHint from "@/components/ui/NavigationHint";
import BackLink from "@/components/ui/BackLink";
import { getClinicDetail } from "@/app/actions/admin";
import PaginationNav from "@/components/PaginationNav";
import StatusBadge from "@/components/StatusBadge";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { formatJapanDate, formatJapanDateTime } from "@/lib/japan-date-time";
import {
  normalizePage,
  paginatedListHref,
} from "@/lib/staff-pagination";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

export const metadata = { title: "医療機関の詳細 | 管理画面" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ClinicDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const rawParams = await searchParams;
  const requestedPage = normalizePage(firstValue(rawParams.page));
  const detail = await getClinicDetail(id, requestedPage);
  if (!detail) notFound();

  const pathname = `/admin/clinics/${id}`;
  if (requestedPage > detail.totalPages) {
    redirect(paginatedListHref(pathname, detail.totalPages));
  }

  const { clinic, staffs, screenings, total, page, pageSize, totalPages } = detail;
  const firstResult = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastResult = Math.min(page * pageSize, total);

  const screeningRows = screenings.map((s) => ({
    id: s.id,
    href: `/admin/screenings/${s.id}`,
    subjectId: s.subject_id ?? "未割り当て",
    staffName: s.staff_name ?? "不明",
    status: s.status,
    capturedAt: formatJapanDateTime(s.created_at),
    inflamedLabel:
      s.status === "completed" ? `${s.total_inflamed_joints ?? 0} 箇所` : "-",
  }));

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/admin/clinics">医療機関の一覧に戻る</BackLink>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">{clinic.name}</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              登録日: {formatJapanDate(clinic.created_at)}
            </p>
          </div>
          <Link href={`/admin/clinics/${clinic.id}/edit`}>
            <Button variant="secondary">編集</Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>所属スタッフ ({staffs.length}件)</CardTitle>
          <Link href={`/admin/staffs/new?clinic_id=${clinic.id}`}>
            <Button size="sm" className="whitespace-nowrap">
              ＋ スタッフアカウント発行
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {staffs.length === 0 ? (
            <p className="text-sm text-muted-foreground">所属スタッフはいません。</p>
          ) : (
            <ul className="divide-y divide-border">
              {staffs.map((staff) => (
                <li key={staff.id} className="flex items-center justify-between py-3">
                  <p className="font-semibold text-foreground">{staff.full_name}</p>
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-block rounded px-2 py-1 text-xs font-semibold ${
                        staff.is_active
                          ? "bg-success text-success-foreground"
                          : "bg-danger text-danger-foreground"
                      }`}
                    >
                      {staff.is_active ? "有効" : "無効"}
                    </span>
                    <Link href={`/admin/staffs/${staff.id}/edit`}>
                      <Button variant="secondary" size="sm">
                        編集
                      </Button>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>撮影記録 ({total}件)</CardTitle>
        </CardHeader>
        <CardContent>
          {total === 0 ? (
            <p className="text-sm text-muted-foreground">撮影記録はありません。</p>
          ) : (
            <>
              <p className="mb-4 text-sm text-secondary-foreground">
                {total}件中 {firstResult}〜{lastResult}件を表示
              </p>
              <ul className="-mx-5 divide-y divide-border border-y border-border lg:hidden">
                {screeningRows.map((row) => (
                  <li key={row.id}>
                    <Link
                      href={row.href}
                      className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-surface-hover"
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="font-mono text-sm font-medium tracking-tight text-foreground">
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
                      <th className="px-4 py-3">被験者ID</th>
                      <th className="px-4 py-3">撮影日時</th>
                      <th className="px-4 py-3">担当スタッフ</th>
                      <th className="px-4 py-3">解析ステータス</th>
                      <th className="px-4 py-3">陽性関節数</th>
                      <th className="px-4 py-3"><span className="sr-only">詳細</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {screeningRows.map((row) => (
                      <tr key={row.id} className="relative transition-colors hover:bg-surface-hover">
                        <td className="px-4 py-3 font-mono text-xs tracking-tight">
                          {row.subjectId}
                        </td>
                        <td className="px-4 py-3 text-xs">{row.capturedAt}</td>
                        <td className="px-4 py-3 text-xs">{row.staffName}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={row.status} />
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
              <PaginationNav
                page={page}
                totalPages={totalPages}
                pathname={pathname}
                ariaLabel="撮影記録のページ移動"
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
