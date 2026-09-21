import type { AnalyzeResponseWithRaw } from "./types.ts";

export interface ScreeningThresholds {
  thr_node: number;
  thr_wrist: number;
}

export function isThreshold(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function parseThresholdInput(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "" ||
      !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) return null;
  const number = Number(value);
  return isThreshold(number) ? number : null;
}

export function formatThreshold(value: number | null | undefined): string {
  return isThreshold(value) ? String(value) : "未記録";
}

/** API原文を保持したまま、保存用の関節判定・集計を生成する。 */
export interface ThresholdedAnalysis extends AnalyzeResponseWithRaw {
  thresholds: ScreeningThresholds;
}

export function applyScreeningThresholds(
  result: AnalyzeResponseWithRaw,
  thresholds: ScreeningThresholds,
): ThresholdedAnalysis {
  if (!isThreshold(thresholds.thr_node) || !isThreshold(thresholds.thr_wrist)) {
    throw new Error("判定閾値が不正です");
  }
  const hands = result.hands.map((hand) => {
    if (hand.joints.length !== hand.num_joints_detected || hand.num_joints_detected > 11) {
      throw new Error("閾値判定に必要な関節結果が不足しています");
    }
    const joints = hand.joints.map((joint) => ({
      ...joint,
      positive: joint.probability >= (joint.joint_id === 15 ? thresholds.thr_wrist : thresholds.thr_node),
    }));
    return {
      ...hand,
      joints,
      num_positive_joints: joints.filter((joint) => joint.positive).length,
      warnings: hand.num_joints_detected === 0 && hand.warnings.length === 0
        ? ["No hand detected in image."] : [...hand.warnings],
    };
  });
  return {
    ...result,
    hands,
    total_positive_joints: hands.reduce((sum, hand) => sum + hand.num_positive_joints, 0),
    thresholds: { ...thresholds },
  };
}
