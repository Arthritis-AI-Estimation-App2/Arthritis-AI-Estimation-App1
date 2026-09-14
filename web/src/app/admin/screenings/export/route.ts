import { getScreeningsForAdmin } from "@/app/actions/admin";
import { buildAdminScreeningsCsv } from "@/lib/admin-screenings-csv";
import {
  normalizeAdminScreeningFilters,
  type AdminScreeningFilters,
} from "@/lib/admin-screening-filters";
import { getCurrentUser } from "@/lib/auth";
import type { NextRequest } from "next/server";

const EXPORT_PAGE_SIZE = 1000;
const MAX_EXPORT_ROWS = 10_000;

export const dynamic = "force-dynamic";

function exportFileName() {
  const iso = new Date().toISOString();
  const date = iso.slice(0, 10).replaceAll("-", "");
  const time = iso.slice(11, 19).replaceAll(":", "");
  const timestamp = `${date}_${time}`;
  return `screenings_${timestamp}.csv`;
}

export async function GET(request: NextRequest) {
  const current = await getCurrentUser();
  if (!current) {
    return Response.redirect(new URL("/login", request.url));
  }
  if (current.profile.role !== "admin") {
    return new Response("CSV出力には管理者権限が必要です。", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const params = request.nextUrl.searchParams;
  const filters = normalizeAdminScreeningFilters({
    clinic: params.get("clinic") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    status: params.get("status") ?? undefined,
    subject: params.get("subject") ?? undefined,
    id: params.get("id") ?? undefined,
    page: "1",
  });

  try {
    const firstPage = await getScreeningsForAdmin(filters, EXPORT_PAGE_SIZE);
    if (firstPage.total > MAX_EXPORT_ROWS) {
      return new Response(
        `CSV出力は${MAX_EXPORT_ROWS.toLocaleString("ja-JP")}件までです。条件を絞り込んで再度お試しください。`,
        {
          status: 422,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }
      );
    }

    const screenings = [...firstPage.screenings];
    for (let page = 2; page <= firstPage.totalPages; page += 1) {
      const pageFilters: AdminScreeningFilters = { ...filters, page };
      const result = await getScreeningsForAdmin(pageFilters, EXPORT_PAGE_SIZE);
      screenings.push(...result.screenings);
    }

    return new Response(buildAdminScreeningsCsv(screenings), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${exportFileName()}"`,
        "Content-Type": "text/csv; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("撮影記録のCSV出力エラー:", error);
    return new Response("CSVの作成に失敗しました。", {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
