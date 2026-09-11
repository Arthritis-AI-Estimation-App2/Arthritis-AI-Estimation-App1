import assert from "node:assert/strict";
import test from "node:test";
import { buildAdminScreeningsCsv } from "../src/lib/admin-screenings-csv.ts";

test("管理者向け解析結果をExcel互換のCSVに変換する", () => {
  const csv = buildAdminScreeningsCsv([
    {
      id: "screening-1",
      subject_id: "keio47",
      status: "completed",
      total_inflamed_joints: 3,
      ra_detected: true,
      ai_model_version: "model-v2",
      analyzed_at: "2026-09-05T01:02:03.000Z",
      created_at: "2026-09-04T15:00:00.000Z",
      subjects: { clinics: { name: "慶應,病院" } },
      profiles: { full_name: '山田 "太郎"', clinics: null },
      joint_results: [
        {
          side: "right",
          joint_name: "thumbIP",
          is_inflamed: true,
          confidence_score: 0.91,
        },
        {
          side: "left",
          joint_name: "wrist",
          is_inflamed: false,
          confidence_score: 0.08,
        },
      ],
    },
  ]);

  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /"関節炎スクリーニング判定"/);
  assert.match(csv, /"慶應,病院"/);
  assert.match(csv, /"山田 ""太郎"""/);
  assert.match(csv, /"解析完了","陽性","3","model-v2"/);
  assert.match(csv, /"2026\/09\/05 10:02:03"/);
  assert.match(csv, /"右手 拇指IP \(thumbIP\) 判定"/);
  assert.match(csv, /"炎症あり","0\.91"/);
  assert.match(csv, /"炎症なし","0\.08"/);
  assert.ok(csv.endsWith("\r\n"));
});

test("未割当記録はスタッフの医療機関を使用し、数式文字列を無害化する", () => {
  const csv = buildAdminScreeningsCsv([
    {
      id: "screening-2",
      subject_id: null,
      status: "failed",
      total_inflamed_joints: null,
      ra_detected: null,
      ai_model_version: null,
      analyzed_at: null,
      created_at: "2026-09-04T15:00:00.000Z",
      subjects: null,
      profiles: {
        full_name: "=IMPORTXML(A1)",
        clinics: { name: "テスト医院" },
      },
      joint_results: [],
    },
  ]);

  assert.match(csv, /"テスト医院","未割当"/);
  assert.match(csv, /"'=IMPORTXML\(A1\)"/);
  assert.match(csv, /"解析失敗","","","",""/);
});
