import { Card, CardContent } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import PaginationNav from "@/components/PaginationNav";
import { formatJapanDateTime } from "@/lib/japan-date-time";
import type { Subject } from "@/lib/types";
import Link from "next/link";

export type SubjectListItem = Subject & { screening_count: number };

interface Props {
  subjects: SubjectListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  query: string;
}

export default function SubjectList({
  subjects,
  total,
  page,
  pageSize,
  totalPages,
  query,
}: Props) {
  const hasQuery = Boolean(query);
  const firstResult = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastResult = Math.min(page * pageSize, total);

  return (
    <div className="space-y-4">
      <form role="search" method="get" className="space-y-3">
        <Input
          id="subject-search"
          name="q"
          type="search"
          label="被験者IDで検索"
          placeholder="例: keio47"
          autoComplete="off"
          enterKeyHint="search"
          defaultValue={query}
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            検索
          </button>
          {hasQuery && (
            <Link
              href="/subjects"
              className="rounded-lg border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-surface-hover"
            >
              検索を解除
            </Link>
          )}
        </div>
      </form>

      <Card>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground" aria-live="polite">
            {total}件中 {firstResult}〜{lastResult}件を表示
          </p>
          {subjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {hasQuery
                ? `「${query}」に一致する被験者IDはありません。`
                : "登録されている被験者IDはありません。"}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {subjects.map((sub) => (
                <li key={sub.id}>
                  <Link
                    href={`/subjects/${sub.id}`}
                    className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    <div>
                      <p className="font-semibold text-foreground">被験者ID: {sub.id}</p>
                      <p className="text-xs text-muted-foreground">
                        判定記録件数: {sub.screening_count}件 | 作成日時:{" "}
                        {formatJapanDateTime(sub.created_at)}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-link">
                      判定履歴を見る →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <PaginationNav
            page={page}
            totalPages={totalPages}
            pathname="/subjects"
            params={{ q: query }}
            ariaLabel="被験者ID一覧のページ移動"
          />
        </CardContent>
      </Card>
    </div>
  );
}
