import NavigationHint from "@/components/ui/NavigationHint";
import { getSubjectDetail } from "@/app/actions/subjects";
import PaginationNav from "@/components/PaginationNav";
import StatusBadge from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { formatJapanDateTime } from "@/lib/japan-date-time";
import {
  normalizePage,
  paginatedListHref,
} from "@/lib/staff-pagination";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SubjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const rawParams = await searchParams;
  const requestedPage = normalizePage(firstValue(rawParams.page));
  const data = await getSubjectDetail(id, requestedPage);

  if (!data) notFound();

  const pathname = `/subjects/${encodeURIComponent(id)}`;
  if (requestedPage > data.totalPages) {
    redirect(paginatedListHref(pathname, data.totalPages));
  }

  const { subject, items: screenings, total, page, pageSize, totalPages } = data;
  const firstResult = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastResult = Math.min(page * pageSize, total);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/subjects" className="text-xs text-link hover:underline">
          ← 被験者ID一覧に戻る
        </Link>
        <h1 className="mt-2 text-xl font-bold text-foreground">
          被験者ID: {subject.id}
        </h1>
        <p className="text-xs text-muted-foreground">
          登録日時: {formatJapanDateTime(subject.created_at)}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>紐付け済みの撮影記録 ({total}件)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {screenings.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">紐付けられている撮影記録はありません。</p>
          ) : (
            <ul className="divide-y divide-border">
              {screenings.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/results/${s.id}`}
                    className="flex items-center justify-between p-4 hover:bg-surface-hover"
                  >
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        撮影日時: {formatJapanDateTime(s.created_at)}
                      </p>
                      {s.status === "completed" && (
                        <p className="text-xs text-secondary-foreground">
                          陽性関節数: {s.total_inflamed_joints}箇所
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={s.status} />
                      <NavigationHint>詳細</NavigationHint>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {total > 0 && (
            <div className="px-4 pb-4">
              <p className="mt-4 text-xs text-muted-foreground">
                {total}件中 {firstResult}〜{lastResult}件を表示
              </p>
              <PaginationNav
                page={page}
                totalPages={totalPages}
                pathname={pathname}
                ariaLabel="撮影・判定履歴のページ移動"
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
