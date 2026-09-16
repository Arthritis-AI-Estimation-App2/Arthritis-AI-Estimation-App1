import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { describeJoint, describeWarning, formatProbability, parseHandSummaries } from "../src/lib/analysis-display.ts";

const fixture = JSON.parse(readFileSync(new URL("../../api-spec/fixtures/success-both-hands.json", import.meta.url), "utf8"));
test("詳細なしでもAPIの左右別集計を保持する", () => {
  const { hands, invalid } = parseHandSummaries(fixture.hands);
  assert.equal(invalid, false);
  assert.equal(hands.left?.num_positive_joints, 3);
  assert.equal(hands.left?.detailsOmitted, true);
  assert.equal(hands.left?.ra_detected, true);
  assert.equal(hands.right?.ra_detected, false);
  assert.equal(describeJoint("thumbIP", undefined, true).status, "結果なし");
  assert.equal(describeJoint("idxDIP", undefined, true).status, "解析対象外");
});
test("旧記録のDIP結果を優先し欠損を陰性にしない", () => {
  assert.equal(describeJoint("idxDIP", undefined).status, "結果なし");
  const actual = describeJoint("idxDIP", { joint_name: "idxDIP", is_inflamed: false, confidence_score: 0 }, true);
  assert.equal(actual.status, "陰性");
  assert.equal(actual.confidence, "0.0%");
  assert.equal(actual.missing, false);
  assert.equal(describeJoint("thumbIP", undefined).confidence, null);
});
test("片手・部分検出・判定と陽性数を再計算せず保持する", () => {
  const hand = { ...fixture.hands[0], ra_detected: false, num_joints_detected: 3, joints: [{ joint_id: 1 }] };
  const result = parseHandSummaries([hand]);
  assert.equal(result.hands.right, undefined);
  assert.equal(result.hands.left?.num_joints_detected, 3);
  assert.equal(result.hands.left?.ra_detected, false);
  assert.equal(result.hands.left?.num_positive_joints, 3);
  assert.equal(result.hands.left?.detailsOmitted, false);
});
test("欠損・不正・重複JSONを安全に扱う", () => {
  for (const value of [null, []]) assert.deepEqual(parseHandSummaries(value), { hands: {}, invalid: false });
  for (const value of [{}, "bad", [null], [fixture.hands[0], fixture.hands[0]], [{ ...fixture.hands[0], hand_probability: 2 }]]) {
    assert.equal(parseHandSummaries(value).invalid, true);
    assert.deepEqual(parseHandSummaries(value).hands, {});
  }
  const partial = parseHandSummaries([fixture.hands[0], { side: "right" }]);
  assert.equal(partial.invalid, true);
  assert.equal(partial.hands.left?.num_positive_joints, 3);
});
test("百分率は小数1桁で、欠損は0にしない", () => {
  assert.equal(formatProbability(0), "0.0%");
  assert.equal(formatProbability(1), "100.0%");
  assert.equal(formatProbability(0.456), "45.6%");
  for (const value of [undefined, null, NaN, Infinity, -1]) assert.equal(formatProbability(value), null);
});
test("既知警告の説明と未知警告の原文を保持する", () => {
  for (const value of ["No hand detected in image.", "Joint 1 (MCP1) crop out of frame; skipped.", "Dorsum reference patch unavailable (landmarks not detected); redness cue degraded.", "Joints not detected/cropped: MCP1"]) {
    assert.ok(describeWarning(value).explanation);
    assert.equal(describeWarning(value).original, value);
  }
  const long = "<script>unknown</script>".repeat(100);
  assert.deepEqual(describeWarning(long), { original: long, explanation: null });
  assert.equal(describeWarning({ detail: "注意", value: 1 }).original, '{"detail":"注意","value":1}');
  assert.equal(describeWarning(null).original, "null");
});
