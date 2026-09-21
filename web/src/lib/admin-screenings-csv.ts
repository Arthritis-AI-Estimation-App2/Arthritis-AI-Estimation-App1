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

const CSV_HEADERS = [
  "撮影ID",
  "医療機関",
  "被験者ID",
  "撮影日時",
  "担当スタッフ",
  "解析ステータス",
  "陽性関節数",
  "AIモデルバージョン",
  "解析日時",
  ...(["right", "left"] as const).flatMap((side) =>
    JOINT_NAMES.flatMap((jointName) => [
      `${side === "right" ? "右手" : "左手"} ${JOINT_LABELS[jointName]} (${jointName}) 判定`,
      `${side === "right" ? "右手" : "左手"} ${JOINT_LABELS[jointName]} (${jointName}) 信頼度 (0-1)`,
    ])
  ),
];

function singleRelation<T>(value: Relation<T> | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatJapanDateTime(value: string | null) {
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

function csvCell(value: string | number | null) {
  let text = value === null ? "" : String(value);
  // 表計算ソフトによる数式解釈を避けつつ、表示値は維持する。
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildAdminScreeningsCsv(rows: AdminScreeningCsvSource[]) {
  const body = rows.map((row) => {
    const subject = singleRelation(row.subjects);
    const profile = singleRelation(row.profiles);
    const subjectClinic = singleRelation(subject?.clinics);
    const staffClinic = singleRelation(profile?.clinics);
    const jointResults = new Map(
      row.joint_results.map((joint) => [
        `${joint.side}:${joint.joint_name}`,
        joint,
      ])
    );
    const jointCells = (["right", "left"] as const).flatMap((side) =>
      JOINT_NAMES.flatMap((jointName: JointName) => {
        const joint = jointResults.get(`${side}:${jointName}`);
        return joint
          ? [joint.is_inflamed ? "炎症あり" : "炎症なし", joint.confidence_score]
          : [null, null];
      })
    );
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
      formatJapanDateTime(row.analyzed_at),
      ...jointCells,
    ]
      .map(csvCell)
      .join(",");
  });

  return `\uFEFF${[CSV_HEADERS.map(csvCell).join(","), ...body].join("\r\n")}\r\n`;
}
