import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateAnalyzeResponse } from "../src/lib/analyze-response.ts";

function loadApiSpecFixture(name: string) {
  return JSON.parse(
    readFileSync(new URL(`../../api-spec/fixtures/${name}`, import.meta.url), "utf8")
  );
}

function hand(side: "left" | "right", overrides: Record<string, unknown> = {}) {
  return {
    side,
    ra_detected: side === "left",
    hand_probability: side === "left" ? 0.48 : 0.22,
    num_positive_joints: side === "left" ? 3 : 0,
    num_joints_detected: 11,
    joints: [],
    warnings: [],
    ...overrides,
  };
}

function response(overrides: Record<string, unknown> = {}) {
  return {
    hands: [hand("left"), hand("right")],
    ra_detected: true,
    total_positive_joints: 3,
    ...overrides,
  };
}

test("AI応答: API仕様のfixturesの正常系を受け入れる", () => {
  const result = validateAnalyzeResponse(loadApiSpecFixture("success-both-hands.json"), [
    "left",
    "right",
  ]);

  assert.equal(result.hands.length, 2);
  assert.equal(result.hands[0].side, "left");
  assert.equal(result.ra_detected, true);
  assert.equal(result.total_positive_joints, 3);
  assert.equal(result.model_version, "2026-09-08-v1");
});

test("AI応答: API仕様のfixturesの関節詳細を受け入れる", () => {
  const fixture = loadApiSpecFixture("success-with-joints.json");
  const result = validateAnalyzeResponse(fixture, ["left", "right"]);

  assert.deepEqual(result.hands[0].joints, fixture.hands[0].joints);
  assert.equal(result.total_positive_joints, 2);
});

test("AI応答: 正しい手ごとの結果と集計値を受け入れる", () => {
  const result = validateAnalyzeResponse(
    response({ model_version: "  2026-09-08-v1  " }),
    ["left", "right"]
  );

  assert.equal(result.hands.length, 2);
  assert.equal(result.hands[0].side, "left");
  assert.equal(result.ra_detected, true);
  assert.equal(result.total_positive_joints, 3);
  assert.equal(result.model_version, "2026-09-08-v1");
});

test("AI応答: モデルバージョンが未提供・空文字でも受け入れる", () => {
  assert.equal(validateAnalyzeResponse(response(), ["left", "right"]).model_version, null);
  assert.equal(
    validateAnalyzeResponse(response({ model_version: "  " }), ["left", "right"])
      .model_version,
    null
  );
  assert.throws(
    () => validateAnalyzeResponse(response({ model_version: 1 }), ["left", "right"]),
    /モデルバージョンが不正/
  );
});

test("AI応答: APIの関節別結果を検証して保持する", () => {
  const joints = [
    { joint_id: 1, joint_name: "MCP1", probability: 0.46, positive: false },
    {
      joint_id: 14,
      joint_name: "IP1 (thumb)",
      probability: 0.48,
      positive: true,
    },
    { joint_id: 15, joint_name: "Wrist", probability: 0.5, positive: true },
  ];
  const result = validateAnalyzeResponse(
    response({
      hands: [
        hand("left", {
          joints,
          num_joints_detected: 3,
          num_positive_joints: 2,
        }),
        hand("right", {
          joints: [{ joint_id: 1, joint_name: "MCP1", probability: 0.45, positive: false }],
          num_joints_detected: 1,
          num_positive_joints: 0,
        }),
      ],
      total_positive_joints: 2,
    }),
    ["left", "right"]
  );

  assert.deepEqual(result.hands[0].joints, joints);
});

test("AI応答: 未対応の関節名と詳細結果の集計不整合を拒否する", () => {
  assert.throws(
    () =>
      validateAnalyzeResponse(
        response({
          hands: [
            hand("left", {
              joints: [{ joint_id: 1, joint_name: "DIP2", probability: 0.4, positive: false }],
              num_joints_detected: 1,
              num_positive_joints: 0,
            }),
            hand("right"),
          ],
          total_positive_joints: 0,
          ra_detected: false,
        }),
        ["left", "right"]
      ),
    /関節結果が不正/
  );
});

test("AI応答: handsが入力順でない場合とside重複を拒否する", () => {
  assert.throws(
    () =>
      validateAnalyzeResponse(
        response({ hands: [hand("right"), hand("left")] }),
        ["left", "right"]
      ),
    /手または入力順が不正/
  );
  assert.throws(
    () => validateAnalyzeResponse(response(), ["left", "left"]),
    /形式が不正/
  );
});

test("AI応答: 確率・関節数・配列の型を検証する", () => {
  for (const invalidHand of [
    hand("left", { hand_probability: 1.1 }),
    hand("left", { num_positive_joints: -1 }),
    hand("left", { num_positive_joints: 12 }),
    hand("left", { joints: null }),
    hand("left", { warnings: "warning" }),
  ]) {
    assert.throws(
      () =>
        validateAnalyzeResponse(
          response({ hands: [invalidHand, hand("right")] }),
          ["left", "right"]
        ),
      /(?:手ごとの解析結果|関節結果)が不正/
    );
  }
});

test("AI応答: 全体判定と陽性関節数の不整合を拒否する", () => {
  assert.throws(
    () => validateAnalyzeResponse(response({ ra_detected: false }), ["left", "right"]),
    /集計値が不正/
  );
  assert.throws(
    () =>
      validateAnalyzeResponse(response({ total_positive_joints: 2 }), [
        "left",
        "right",
      ]),
    /集計値が不正/
  );
});
