import type {
  AiJointResult,
  AnalyzeResponse,
  AiHandResult,
  HandSide,
} from "@/lib/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export const API_JOINTS = [
  { id: 1, name: "MCP1" },
  { id: 2, name: "MCP2" },
  { id: 3, name: "MCP3" },
  { id: 4, name: "MCP4" },
  { id: 5, name: "MCP5" },
  { id: 6, name: "PIP2" },
  { id: 7, name: "PIP3" },
  { id: 8, name: "PIP4" },
  { id: 9, name: "PIP5" },
  { id: 14, name: "IP1 (thumb)" },
  { id: 15, name: "Wrist" },
] as const;

function parseJoints(value: unknown, numJointsDetected: number, numPositiveJoints: number) {
  if (!Array.isArray(value)) {
    throw new Error("AIレスポンスの関節結果が不正です");
  }

  // 初期契約のように詳細が省略される応答も受け入れる。
  if (value.length === 0) return [];
  if (value.length !== numJointsDetected) {
    throw new Error("AIレスポンスの検出関節数が不正です");
  }

  const joints = value.map((item): AiJointResult => {
    if (!isRecord(item)) {
      throw new Error("AIレスポンスの関節結果が不正です");
    }
    const { joint_id, joint_name, probability, positive } = item;
    const expected = API_JOINTS.find(
      (joint) => joint.id === joint_id && joint.name === joint_name
    );
    if (
      !expected ||
      !isNonNegativeInteger(joint_id) ||
      typeof joint_name !== "string" ||
      typeof probability !== "number" ||
      !Number.isFinite(probability) ||
      probability < 0 ||
      probability > 1 ||
      typeof positive !== "boolean"
    ) {
      throw new Error("AIレスポンスの関節結果が不正です");
    }
    return { joint_id, joint_name, probability, positive };
  });

  if (
    new Set(joints.map((joint) => joint.joint_id)).size !== joints.length ||
    new Set(joints.map((joint) => joint.joint_name)).size !== joints.length ||
    joints.filter((joint) => joint.positive).length !== numPositiveJoints
  ) {
    throw new Error("AIレスポンスの関節結果の集計値が不正です");
  }

  return joints;
}

function parseHand(value: unknown, expectedSide: HandSide): AiHandResult {
  if (!isRecord(value) || value.side !== expectedSide) {
    throw new Error("AIレスポンスの手または入力順が不正です");
  }

  const {
    ra_detected,
    hand_probability,
    num_positive_joints,
    num_joints_detected,
    joints,
    warnings,
  } = value;

  if (
    typeof ra_detected !== "boolean" ||
    typeof hand_probability !== "number" ||
    !Number.isFinite(hand_probability) ||
    hand_probability < 0 ||
    hand_probability > 1 ||
    !isNonNegativeInteger(num_positive_joints) ||
    !isNonNegativeInteger(num_joints_detected) ||
    num_positive_joints > num_joints_detected ||
    !Array.isArray(warnings)
  ) {
    throw new Error("AIレスポンスの手ごとの解析結果が不正です");
  }

  const parsedJoints = parseJoints(
    joints,
    num_joints_detected,
    num_positive_joints
  );

  return {
    side: expectedSide,
    ra_detected,
    hand_probability,
    num_positive_joints,
    num_joints_detected,
    joints: parsedJoints,
    warnings,
  };
}

/** 外部AIの応答を、保存前にアプリケーションの契約に照らして検証する。 */
export function validateAnalyzeResponse(
  value: unknown,
  expectedSides: readonly HandSide[]
): AnalyzeResponse {
  const rawHands = isRecord(value) ? value.hands : null;
  if (
    !isRecord(value) ||
    !Array.isArray(rawHands) ||
    rawHands.length !== expectedSides.length ||
    expectedSides.length < 1 ||
    expectedSides.length > 2 ||
    new Set(expectedSides).size !== expectedSides.length
  ) {
    throw new Error("AIレスポンスの形式が不正です");
  }

  const hands = expectedSides.map((side, index) =>
    parseHand(rawHands[index], side)
  );
  const rawModelVersion = value.model_version;
  if (rawModelVersion !== undefined && typeof rawModelVersion !== "string") {
    throw new Error("AIレスポンスのモデルバージョンが不正です");
  }
  const modelVersion = rawModelVersion?.trim() || null;
  const totalPositiveJoints = hands.reduce(
    (total, hand) => total + hand.num_positive_joints,
    0
  );
  const raDetected = hands.some((hand) => hand.ra_detected);

  if (
    typeof value.ra_detected !== "boolean" ||
    value.ra_detected !== raDetected ||
    !isNonNegativeInteger(value.total_positive_joints) ||
    value.total_positive_joints !== totalPositiveJoints
  ) {
    throw new Error("AIレスポンスの集計値が不正です");
  }

  return {
    model_version: modelVersion,
    hands,
    ra_detected: value.ra_detected,
    total_positive_joints: totalPositiveJoints,
  };
}
