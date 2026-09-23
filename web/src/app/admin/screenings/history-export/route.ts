import { getCurrentUser } from "@/lib/auth";
import { getAnalysisHistoryExportPage } from "@/app/actions/analysis-history";
import { buildAnalysisHistoryCsv, compareAnalysisHistoryRows } from "@/lib/analysis-history-csv";
import { normalizeAdminScreeningFilters } from "@/lib/admin-screening-filters";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
const MAX_EXPORT_ROWS = 10_000;

function failure(message: string, status: number) {
  return new Response(message, { status, headers: {
    "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store",
  } });
}

export async function GET(request: NextRequest) {
  const current = await getCurrentUser();
  if (!current?.profile.is_active) return failure("ログインが必要です。", 401);
  if (current.profile.role !== "admin") return failure("履歴CSV出力には管理者権限が必要です。", 403);
  const p = request.nextUrl.searchParams;
  const filters = normalizeAdminScreeningFilters({
    clinic: p.get("clinic") ?? undefined, from: p.get("from") ?? undefined,
    to: p.get("to") ?? undefined, status: p.get("status") ?? undefined,
    subject: p.get("subject") ?? undefined, id: p.get("id") ?? undefined,
  });
  const startedAt = new Date().toISOString();
  try {
    const first = await getAnalysisHistoryExportPage(filters, 1, startedAt);
    if (first.total > MAX_EXPORT_ROWS) return failure("履歴CSVは10,000件までです。撮影記録の条件を絞り込んでください。", 422);
    const rows = [...first.runs];
    for (let page = 2; page <= Math.ceil(first.total / 500); page++) {
      const next = await getAnalysisHistoryExportPage(filters, page, startedAt);
      if (next.total !== first.total) return failure("出力中に撮影記録が更新されました。再度出力してください。", 409);
      rows.push(...next.runs);
    }
    if (rows.length !== first.total || new Set(rows.map((row) => row.id)).size !== first.total) {
      return failure("履歴をすべて取得できませんでした。再度出力してください。", 409);
    }
    rows.sort(compareAnalysisHistoryRows);
    return new Response(buildAnalysisHistoryCsv(rows), { headers: {
      "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="analysis_history_${startedAt.replace(/[-:]/g, "").replace(/\..*/, "")}.csv"`,
    } });
  } catch (error) {
    console.error("解析履歴CSV出力エラー:", error);
    return failure("履歴CSVの作成に失敗しました。", 500);
  }
}
