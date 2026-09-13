import { getSubjects, getUnassignedScreenings } from "@/app/actions/subjects";
import { normalizePage, paginatedListHref } from "@/lib/staff-pagination";
import SubjectGroupingView from "@/components/SubjectGroupingView";
import { redirect } from "next/navigation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function GroupingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const rawParams = await searchParams;
  const requestedPage = normalizePage(firstValue(rawParams.page));
  const [unassigned, subjects] = await Promise.all([
    getUnassignedScreenings(requestedPage),
    getSubjects(),
  ]);

  if (requestedPage > unassigned.totalPages) {
    redirect(paginatedListHref("/grouping", unassigned.totalPages));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">撮影記録を被験者IDに紐付け</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          未割り当ての撮影記録を、被験者IDに紐付けます。
        </p>
      </div>

      <SubjectGroupingView
        key={unassigned.page}
        unassignedScreenings={unassigned.items}
        subjects={subjects}
        total={unassigned.total}
        page={unassigned.page}
        pageSize={unassigned.pageSize}
        totalPages={unassigned.totalPages}
      />
    </div>
  );
}
