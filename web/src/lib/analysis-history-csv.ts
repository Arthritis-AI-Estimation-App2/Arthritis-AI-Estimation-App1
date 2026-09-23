import { csvCell, formatJapanDateTime, jointCsvCells, CSV_JOINT_HEADERS } from "./admin-screenings-csv.ts";
import { analysisRunJoints, analysisRunKindLabel } from "./analysis-history.ts";
import { SCREENING_STATUS_LABELS } from "./screening-status.ts";
import type { getAnalysisHistoryExportPage } from "@/app/actions/analysis-history";
import type { ScreeningStatus } from "./types";

export type AnalysisHistoryCsvRow = Awaited<ReturnType<typeof getAnalysisHistoryExportPage>>["runs"][number];

/** 一覧と同じ撮影日時の新しい順。同時刻は撮影IDの降順、同一撮影は記録番号の降順。 */
export function compareAnalysisHistoryRows(a: AnalysisHistoryCsvRow, b: AnalysisHistoryCsvRow) {
  const createdAt = timestampDescending(a.screenings.created_at, b.screenings.created_at);
  if (createdAt !== 0) return createdAt;
  if (a.screening_id !== b.screening_id) return a.screening_id < b.screening_id ? 1 : -1;
  return b.run_number - a.run_number;
}

function timestampDescending(a: string, b: string) {
  const delta = Date.parse(b) - Date.parse(a);
  return Number.isFinite(delta) ? delta : 0;
}

export function buildAnalysisHistoryCsv(rows: AnalysisHistoryCsvRow[]) {
  const headers = [
    "撮影ID", "医療機関", "被験者ID", "撮影日時",
    "実行ID", "記録番号", "実行区分", "実行者ID", "実行者",
    "解析開始日時", "解析終了日時", "解析ステータス", "AIモデルバージョン",
    "指関節の判定閾値（0〜1）", "手関節の判定閾値（0〜1）",
    "エラーコード", "HTTPステータス", "エラー日時", "陽性関節数", ...CSV_JOINT_HEADERS,
  ];
  const body = rows.map((r) => {
    const s = r.screenings;
    return [
      r.screening_id, s.subjects?.clinics?.name ?? s.profiles?.clinics?.name ?? "未割り当て",
      s.subject_id, formatJapanDateTime(s.created_at), r.id, r.run_number,
      analysisRunKindLabel(r.kind), r.executed_by, r.executor_name,
      formatJapanDateTime(r.started_at), formatJapanDateTime(r.finished_at),
      SCREENING_STATUS_LABELS[r.status as ScreeningStatus] ?? r.status, r.ai_model_version,
      r.analysis_thr_node, r.analysis_thr_wrist,
      r.analysis_error_code, r.analysis_error_http_status, formatJapanDateTime(r.analysis_error_at),
      r.total_inflamed_joints,
      ...jointCsvCells(analysisRunJoints(r.joint_results)),
    ].map(csvCell).join(",");
  });
  return `\uFEFF${[headers.map(csvCell).join(","), ...body].join("\r\n")}\r\n`;
}
