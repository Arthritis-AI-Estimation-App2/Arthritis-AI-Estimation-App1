import { getClinicDetail } from "@/app/actions/admin";
import StatusBadge from "@/components/StatusBadge";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { formatJapanDate, formatJapanDateTime } from "@/lib/japan-date-time";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata = { title: "医療機関の詳細 | 管理画面" };

export default async function ClinicDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getClinicDetail(id);
  if (!detail) notFound();

  const { clinic, staffs, screenings } = detail;

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
        <Link href="/admin/clinics" className="text-xs text-link hover:underline">
          ← 医療機関の一覧に戻る
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">{clinic.name}</h1>
            <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              <p>
                ID: <span className="font-mono tracking-tight">{clinic.id}</span>
              </p>
              <p>登録日: {formatJapanDate(clinic.created_at)}</p>
            </div>
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
          <CardTitle>撮影記録 ({screenings.length}件)</CardTitle>
        </CardHeader>
        <CardContent>
          {screenings.length === 0 ? (
            <p className="text-sm text-muted-foreground">撮影記録はありません。</p>
          ) : (
            <>
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
                      <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-link">
                        結果を見る →
                      </span>
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
                      <th className="px-4 py-3">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {screeningRows.map((row) => (
                      <tr key={row.id} className="hover:bg-surface-hover">
                        <td className="px-4 py-3 font-mono text-xs tracking-tight">
                          {row.subjectId}
                        </td>
                        <td className="px-4 py-3 text-xs">{row.capturedAt}</td>
                        <td className="px-4 py-3 text-xs">{row.staffName}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="px-4 py-3 text-xs">{row.inflamedLabel}</td>
                        <td className="px-4 py-3">
                          <Link
                            href={row.href}
                            className="text-xs font-semibold text-link hover:underline"
                          >
                            結果を見る →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
