import assert from "node:assert/strict";
import test from "node:test";
import { applyScreeningThresholds, formatThreshold, parseThresholdInput } from "../src/lib/screening-thresholds.ts";
import type { AnalyzeResponseWithRaw } from "../src/lib/types.ts";

function response(): AnalyzeResponseWithRaw {
  return {
    model_version: "test", ra_detected: false, total_positive_joints: 0,
    raw_response: { original: true },
    hands: (["left", "right"] as const).map((side) => ({
      side, ra_detected: false, hand_probability: 0.5,
      num_positive_joints: 0, num_joints_detected: 2, warnings: [],
      joints: [
        { joint_id: 1, joint_name: "MCP1", probability: 0.5, positive: false },
        { joint_id: 15, joint_name: "Wrist", probability: 0.5, positive: false },
      ],
    })),
  };
}

test("左右の手関節だけ別閾値を適用し、同値を陽性とし、原文を変更しない", () => {
  const input = response();
  const original = structuredClone(input);
  const result = applyScreeningThresholds(input, { thr_node: 0.5, thr_wrist: 0.6 });
  assert.equal(result.total_positive_joints, 2);
  for (const hand of result.hands) {
    assert.deepEqual(hand.joints.map((j) => j.positive), [true, false]);
    assert.equal(hand.num_positive_joints, 1);
    assert.deepEqual(hand.joints.map((j) => j.probability), [0.5, 0.5]);
  }
  assert.deepEqual(input, original);
  assert.strictEqual(result.raw_response, input.raw_response);
});

test("閾値0・1、手関節の同値、設定オブジェクト変更からの分離", () => {
  const input = response();
  input.hands[0].joints[0].probability = 0;
  input.hands[0].joints[1].probability = 1;
  const thresholds = { thr_node: 0, thr_wrist: 1 };
  const result = applyScreeningThresholds(input, thresholds);
  assert.deepEqual(result.hands[0].joints.map((j) => j.positive), [true, true]);
  assert.deepEqual(result.hands[1].joints.map((j) => j.positive), [true, false]);
  thresholds.thr_node = 1;
  assert.equal(result.thresholds.thr_node, 0);
});

test("不足した関節詳細を拒否し、0件は警告付きで保存する", () => {
  const input = response();
  input.hands[0].joints = [];
  assert.throws(() => applyScreeningThresholds(input, { thr_node: 0.5, thr_wrist: 0.6 }), /不足/);
  input.hands[0].num_joints_detected = 0;
  const result = applyScreeningThresholds(input, { thr_node: 0.5, thr_wrist: 0.6 });
  assert.equal(result.hands[0].num_positive_joints, 0);
  assert.equal(result.hands[0].joints.length, 0);
  assert.ok(result.hands[0].warnings.length);
});

test("閾値入力の検証と丸めなし表示・旧記録の未記録表示", () => {
  for (const value of ["", " ", "NaN", "Infinity", "-0.1", "1.01", "0x1", null]) {
    assert.equal(parseThresholdInput(value), null);
  }
  for (const value of ["0", "1", "0.34396984924623114", "4e-1"]) {
    assert.equal(parseThresholdInput(value), Number(value));
  }
  assert.equal(formatThreshold(0.34396984924623114), "0.34396984924623114");
  assert.equal(formatThreshold(0), "0");
  for (const value of [null, undefined, NaN]) assert.equal(formatThreshold(value), "未記録");
});
