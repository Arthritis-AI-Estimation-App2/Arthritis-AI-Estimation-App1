import assert from "node:assert/strict";
import test from "node:test";
import {
  ANALYSIS_WAIT_SLOW_AFTER_MS,
  ANALYSIS_WAIT_STEPS,
  ANALYSIS_WAIT_VERY_SLOW_AFTER_MS,
  getAnalysisStepStates,
  getAnalysisWaitCopy,
  isAnalysisPipelinePhase,
} from "../src/lib/analysis-wait.ts";

test("パイプライン段階だけを判定する", () => {
  assert.equal(isAnalysisPipelinePhase("creating"), true);
  assert.equal(isAnalysisPipelinePhase("uploading"), true);
  assert.equal(isAnalysisPipelinePhase("analyzing"), true);
  assert.equal(isAnalysisPipelinePhase("cleaning"), false);
});

test("現在の段階まで完了、以降を未完了として表示する", () => {
  assert.deepEqual(getAnalysisStepStates("creating"), [
    "current",
    "pending",
    "pending",
  ]);
  assert.deepEqual(getAnalysisStepStates("uploading"), [
    "done",
    "current",
    "pending",
  ]);
  assert.deepEqual(getAnalysisStepStates("analyzing"), [
    "done",
    "done",
    "current",
  ]);
});

test("一時データ削除中はパイプラインの進行を示さない", () => {
  assert.deepEqual(getAnalysisStepStates("cleaning"), [
    "pending",
    "pending",
    "pending",
  ]);
  assert.equal(getAnalysisStepStates("cleaning").length, ANALYSIS_WAIT_STEPS.length);
});

test("解析前の段階は経過時間で文面を変えない", () => {
  assert.deepEqual(
    getAnalysisWaitCopy("creating", 30_000),
    getAnalysisWaitCopy("creating", 0)
  );
  assert.deepEqual(
    getAnalysisWaitCopy("uploading", 30_000),
    getAnalysisWaitCopy("uploading", 0)
  );
  assert.equal(getAnalysisWaitCopy("cleaning").title, "一時データを削除しています");
});

test("解析中は経過時間に応じて3段階の文面を出す", () => {
  assert.equal(getAnalysisWaitCopy("analyzing", 0).title, "画像を解析しています");
  assert.equal(
    getAnalysisWaitCopy("analyzing", ANALYSIS_WAIT_SLOW_AFTER_MS - 1).title,
    "画像を解析しています"
  );
  assert.equal(
    getAnalysisWaitCopy("analyzing", ANALYSIS_WAIT_SLOW_AFTER_MS).title,
    "解析に時間がかかっています"
  );
  assert.equal(
    getAnalysisWaitCopy("analyzing", ANALYSIS_WAIT_VERY_SLOW_AFTER_MS - 1).title,
    "解析に時間がかかっています"
  );
  assert.equal(
    getAnalysisWaitCopy("analyzing", ANALYSIS_WAIT_VERY_SLOW_AFTER_MS).title,
    "まだ解析中です"
  );
  assert.equal(getAnalysisWaitCopy("analyzing", 120_000).title, "まだ解析中です");
});

test("経過時間が不正な値でも初期の文面に落とす", () => {
  assert.equal(getAnalysisWaitCopy("analyzing", -5_000).title, "画像を解析しています");
  assert.equal(getAnalysisWaitCopy("analyzing", Number.NaN).title, "画像を解析しています");
  assert.equal(getAnalysisWaitCopy("analyzing").title, "画像を解析しています");
});
