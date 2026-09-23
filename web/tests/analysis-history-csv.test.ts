import assert from "node:assert/strict";
import test from "node:test";
import { buildAnalysisHistoryCsv, type AnalysisHistoryCsvRow } from "../src/lib/analysis-history-csv.ts";
import { analysisRunJoints } from "../src/lib/analysis-history.ts";
import { adminAnalysisHistoryExportHref, normalizeAdminScreeningFilters } from "../src/lib/admin-screening-filters.ts";

const row: AnalysisHistoryCsvRow = {
  id: "run-1", screening_id: "screening-1", run_number: 1, kind: "initial",
  executed_by: "user-1", executor_name: '=TEST("name")',
  started_at: "2026-09-22T00:00:00Z", finished_at: "2026-09-22T00:00:05Z",
  status: "completed", source: "api", analysis_thr_node: 0.34396984924623114,
  analysis_thr_wrist: 0.4344221105527638, ai_model_version: "model-v1",
  total_inflamed_joints: 0,
  joint_results: [{ id: "joint-1", screening_id: "screening-1", side: "left", joint_name: "wrist", is_inflamed: false, confidence_score: 0.2 }],
  analysis_error_code: null, analysis_error_http_status: null, analysis_error_at: null,
  screenings: { id: "screening-1", subject_id: "keio1", created_at: "2026-09-21T00:00:00Z",
    subjects: { clinics: { name: '病院,"A"' } }, profiles: null },
};

function parseCsv(csv: string) {
  return csv.slice(1).trimEnd().split("\r\n").map((line) =>
    [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map((m) => m[1].replaceAll('""', '"')));
}

test("履歴CSVは各実行の閾値・実行者・日時・関節確率を79列で出力する", () => {
  const csv = buildAnalysisHistoryCsv([row]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.endsWith("\r\n"));
  const [headers, values] = parseCsv(csv);
  assert.equal(headers.length, 79);
  assert.deepEqual(headers.slice(13, 16), ["手関節以外の判定閾値（0〜1）", "手関節の判定閾値（0〜1）", "陽性関節数"]);
  assert.equal(values.length, 79);
  assert.equal(values[1], '病院,"A"');
  assert.equal(values[8], "'=TEST(\"name\")");
  assert.equal(values[9], "2026/09/22 09:00:00");
  assert.equal(values[13], "0.34396984924623114");
  assert.equal(values[14], "0.4344221105527638");
  assert.equal(values[15], "0");
  assert.equal(values.at(-2), "炎症なし");
  assert.equal(values.at(-1), "0.2");
  assert.equal(values[19], "", "未検出関節を陰性としない");
});

test("失敗・解析中・実行区分のない行も別行で残し、不明な値は空欄にする", () => {
  const empty = { ...row, executed_by: null, executor_name: null, started_at: null,
    finished_at: null, source: null, analysis_thr_node: null, analysis_thr_wrist: null,
    ai_model_version: null, total_inflamed_joints: null, joint_results: [],
    screenings: { ...row.screenings, subjects: null, profiles: { clinics: { name: "所属医院" } } } };
  const [, legacy, failed, running] = parseCsv(buildAnalysisHistoryCsv([
    { ...empty, id: "legacy", kind: "legacy" },
    { ...empty, id: "failed", status: "failed", analysis_error_code: "api_http_error", analysis_error_http_status: 503 },
    { ...empty, id: "running", status: "analyzing" },
  ]));
  assert.equal(legacy[6], "");
  assert.equal(legacy[1], "所属医院");
  assert.deepEqual(legacy.slice(7, 11), ["", "", "", ""]);
  assert.deepEqual(legacy.slice(12, 16), ["", "", "", ""]);
  assert.equal(failed[11], "解析失敗");
  assert.equal(failed[16], "api_http_error");
  assert.equal(failed[17], "503");
  assert.equal(running[11], "解析中");
  assert.ok(failed.slice(19).every((cell) => cell === ""));
});

test("履歴CSVリンクは一覧の全条件を引き継ぎ、ページ番号を除く", () => {
  const filters = normalizeAdminScreeningFilters({ id: "12345678", from: "2026-09-01", status: "failed", subject: "keio1", page: "3" });
  assert.equal(adminAnalysisHistoryExportHref(filters), "/admin/screenings/history-export?from=2026-09-01&status=failed&subject=keio1&id=12345678");
});

test("履歴の関節スナップショットは不正な確率・欠損を表示値に変換しない", () => {
  assert.deepEqual(analysisRunJoints(null), []);
  assert.deepEqual(analysisRunJoints([{ side: "left", confidence_score: -1 }]), []);
  assert.equal(analysisRunJoints(row.joint_results).length, 1);
});
