import { csvCell, formatJapanDateTime, jointCsvCells, CSV_JOINT_HEADERS } from "./admin-screenings-csv.ts";
import { analysisRunJoints, analysisRunKindLabel } from "./analysis-history.ts";
import { SCREENING_STATUS_LABELS } from "./screening-status.ts";
import type { getAnalysisHistoryExportPage } from "@/app/actions/analysis-history";
import type { ScreeningStatus } from "./types";

export type AnalysisHistoryCsvRow = Awaited<ReturnType<typeof getAnalysisHistoryExportPage>>["runs"][number];

export function buildAnalysisHistoryCsv(rows: AnalysisHistoryCsvRow[]) {
  const headers = [
    "撮影ID", "医療機関（現在）", "被験者ID（現在）", "撮影日時",
    "実行ID", "記録番号", "実行区分", "実行者ID", "実行者（実行時）",
    "開始日時", "終了日時", "解析ステータス", "AIモデルバージョン",
    "手関節以外の判定閾値（0〜1）", "手関節の判定閾値（0〜1）", "RA検出", "陽性関節数",
    "エラーコード", "HTTPステータス", "エラー日時", ...CSV_JOINT_HEADERS,
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
      r.ra_detected === null ? null : r.ra_detected ? "あり" : "なし", r.total_inflamed_joints,
      r.analysis_error_code, r.analysis_error_http_status, formatJapanDateTime(r.analysis_error_at),
      ...jointCsvCells(analysisRunJoints(r.joint_results)),
    ].map(csvCell).join(",");
  });
  return `\uFEFF${[headers.map(csvCell).join(","), ...body].join("\r\n")}\r\n`;
}
