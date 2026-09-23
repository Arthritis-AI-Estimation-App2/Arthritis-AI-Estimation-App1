import { JOINT_LABELS, JOINT_NAMES, type JointName } from "./joints.ts";
import { SCREENING_STATUS_LABELS } from "./screening-status.ts";
import { staffDisplayName } from "./staff-display-name.ts";
import type { ScreeningStatus } from "./types.ts";

type Relation<T> = T | T[] | null;

type AdminScreeningCsvSource = {
  id: string;
  subject_id: string | null;
  status: string;
  total_inflamed_joints: number | null;
  ai_model_version: string | null;
  analysis_thr_node: number | null;
  analysis_thr_wrist: number | null;
  analyzed_at: string | null;
  created_at: string;
  subjects: Relation<{
    clinics: Relation<{ name: string }>;
  }>;
  profiles: Relation<{
    full_name: string;
    deleted_at: string | null;
    clinics: Relation<{ name: string }>;
  }>;
  joint_results: Array<{
    side: string;
    joint_name: string;
    is_inflamed: boolean;
    confidence_score: number;
  }>;
};

export const CSV_JOINT_HEADERS = (["right", "left"] as const).flatMap((side) =>
  JOINT_NAMES.flatMap((jointName) => [
    `${side === "right" ? "右手" : "左手"} ${JOINT_LABELS[jointName]} 判定`,
    `${side === "right" ? "右手" : "左手"} ${JOINT_LABELS[jointName]} 炎症確率 (0-1)`,
  ])
);

const CSV_HEADERS = [
  "撮影ID",
  "医療機関",
  "被験者ID",
  "撮影日時",
  "担当スタッフ",
  "解析ステータス",
  "陽性関節数",
  "AIモデルバージョン",
  "指関節の判定閾値（0〜1）",
  "手関節の判定閾値（0〜1）",
  "解析日時",
  ...CSV_JOINT_HEADERS,
];

function singleRelation<T>(value: Relation<T> | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function formatJapanDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function csvCell(value: string | number | null) {
  let text = value === null ? "" : String(value);
  // 表計算ソフトによる数式解釈を避けつつ、表示値は維持する。
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function jointCsvCells(joints: AdminScreeningCsvSource["joint_results"]) {
  const jointResults = new Map(
    joints.map((joint) => [
      `${joint.side}:${joint.joint_name}`,
      joint,
    ])
  );
  return (["right", "left"] as const).flatMap((side) =>
    JOINT_NAMES.flatMap((jointName: JointName) => {
      const joint = jointResults.get(`${side}:${jointName}`);
      return joint
        ? [joint.is_inflamed ? "炎症あり" : "炎症なし", joint.confidence_score]
        : [null, null];
    })
  );
}

export function buildAdminScreeningsCsv(rows: AdminScreeningCsvSource[]) {
  const body = rows.map((row) => {
    const subject = singleRelation(row.subjects);
    const profile = singleRelation(row.profiles);
    const subjectClinic = singleRelation(subject?.clinics);
    const staffClinic = singleRelation(profile?.clinics);
    const jointCells = jointCsvCells(row.joint_results);
    const hasAnalysis = row.status === "completed";

    return [
      row.id,
      subjectClinic?.name ?? staffClinic?.name ?? "未割り当て",
      row.subject_id ?? "未割り当て",
      formatJapanDateTime(row.created_at),
      staffDisplayName(profile),
      row.status in SCREENING_STATUS_LABELS
        ? SCREENING_STATUS_LABELS[row.status as ScreeningStatus]
        : row.status,
      hasAnalysis ? row.total_inflamed_joints : null,
      row.ai_model_version,
      hasAnalysis ? row.analysis_thr_node : null,
      hasAnalysis ? row.analysis_thr_wrist : null,
      formatJapanDateTime(row.analyzed_at),
      ...jointCells,
    ]
      .map(csvCell)
      .join(",");
  });

  return `\uFEFF${[CSV_HEADERS.map(csvCell).join(","), ...body].join("\r\n")}\r\n`;
}
