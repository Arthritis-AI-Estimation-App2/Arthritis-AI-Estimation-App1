import { getSubjectsPage } from "@/app/actions/subjects";
import SubjectList from "@/components/SubjectList";
import {
  normalizePage,
  paginatedListHref,
} from "@/lib/staff-pagination";
import { normalizeSubjectQuery } from "@/lib/subject-search";
import { redirect } from "next/navigation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export const metadata = { title: "被験者一覧 | 関節炎スクリーニング" };

export default async function SubjectsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const rawParams = await searchParams;
  const requestedPage = normalizePage(firstValue(rawParams.page));
  const query = normalizeSubjectQuery(firstValue(rawParams.q) ?? "");
  const result = await getSubjectsPage({ page: requestedPage, query });

  if (requestedPage > result.totalPages) {
    redirect(paginatedListHref("/subjects", result.totalPages, { q: query }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">被験者一覧</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          被験者IDの一覧と過去の撮影記録件数です。再来院時はIDで絞り込めます。
        </p>
      </div>

      <SubjectList
        subjects={result.items}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        totalPages={result.totalPages}
        query={result.query}
      />
    </div>
  );
}
