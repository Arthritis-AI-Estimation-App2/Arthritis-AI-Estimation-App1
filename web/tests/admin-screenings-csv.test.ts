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
      ai_model_version: "model-v2",
      analysis_thr_node: 0.34396984924623114,
      analysis_thr_wrist: 0.4344221105527638,
      analyzed_at: "2026-09-05T01:02:03.000Z",
      created_at: "2026-09-04T15:00:00.000Z",
      subjects: { clinics: { name: "慶應,病院" } },
      profiles: { full_name: '山田 "太郎"', deleted_at: null, clinics: null },
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
  assert.doesNotMatch(csv, /"関節炎スクリーニング判定"/);
  assert.match(csv, /"慶應,病院"/);
  assert.match(csv, /"山田 ""太郎"""/);
  assert.match(csv, /"解析完了","3","model-v2"/);
  assert.match(csv, /"2026\/09\/05 10:02:03"/);
  assert.match(csv, /"右手 拇指IP \(thumbIP\) 判定"/);
  assert.match(csv, /"炎症あり","0\.91"/);
  assert.match(csv, /"炎症なし","0\.08"/);
  const [header, row] = csv.slice(1).trimEnd().split("\r\n").map(
    (line) => [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(
      (match) => match[1].replaceAll('""', '"')
    )
  );
  assert.equal(header.length, 71);
  assert.equal(row.length, 71);
  assert.equal(header[6], "陽性関節数");
  assert.equal(row[6], "3");
  assert.equal(header[9], "右手 拇指IP (thumbIP) 判定");
  assert.equal(row[9], "炎症あり");
  assert.equal(header[68], "左手 手関節 (wrist) 信頼度 (0-1)");
  assert.equal(row[68], "0.08");
  assert.deepEqual(header.slice(-2), ["thr_node (0-1)", "thr_wrist (0-1)"]);
  assert.deepEqual(row.slice(-2), ["0.34396984924623114", "0.4344221105527638"]);
  assert.ok(csv.endsWith("\r\n"));
});

test("未割り当て記録はスタッフの医療機関を使用し、数式文字列を無害化する", () => {
  const csv = buildAdminScreeningsCsv([
    {
      id: "screening-2",
      subject_id: null,
      status: "failed",
      total_inflamed_joints: null,
      ai_model_version: null,
      analysis_thr_node: null,
      analysis_thr_wrist: null,
      analyzed_at: null,
      created_at: "2026-09-04T15:00:00.000Z",
      subjects: null,
      profiles: {
        full_name: "=IMPORTXML(A1)",
        deleted_at: null,
        clinics: { name: "テスト医院" },
      },
      joint_results: [],
    },
  ]);

  assert.match(csv, /"テスト医院","未割り当て"/);
  assert.match(csv, /"'=IMPORTXML\(A1\)"/);
  assert.match(csv, /"解析失敗","","",""/);
});

test("削除済みスタッフの記録は担当スタッフを(削除済みユーザー)と表示する", () => {
  const csv = buildAdminScreeningsCsv([
    {
      id: "screening-3",
      subject_id: "keio48",
      status: "completed",
      total_inflamed_joints: 0,
      ai_model_version: null,
      analysis_thr_node: null,
      analysis_thr_wrist: null,
      analyzed_at: "2026-09-06T00:00:00.000Z",
      created_at: "2026-09-05T15:00:00.000Z",
      subjects: { clinics: { name: "テスト医院" } },
      profiles: { full_name: "山田 太郎", deleted_at: "2026-09-06T00:00:00.000Z", clinics: null },
      joint_results: [],
    },
  ]);

  assert.match(csv, /"\(削除済みユーザー\)"/);
  assert.ok(csv.endsWith(',"",""\r\n'));
});
