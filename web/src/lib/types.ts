import type { Json, Tables } from "@/lib/supabase/database.types";

export type Clinic = Tables<"clinics">;
export type Profile = Tables<"profiles">;
export type Subject = Tables<"subjects">;
// screening_clinic_id は絞り込み用の計算列で、画面用の撮影記録には含めない。
export type Screening = Omit<Tables<"screenings">, "screening_clinic_id">;
export type JointResult = Tables<"joint_results">;

// PostgreSQLのtext + CHECK制約はSupabaseの生成型ではstringになるため、
// アプリケーションで扱う有効値をドメイン型として定義する。
export type Role = "admin" | "clinic_staff";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "管理者",
  clinic_staff: "医療機関スタッフ",
};

export function roleLabel(role: string): string {
  return role in ROLE_LABELS ? ROLE_LABELS[role as Role] : role;
}

export type ScreeningStatus = "uploading" | "analyzing" | "completed" | "failed";
export type HandSide = "right" | "left";

export interface JointPrediction {
  joint_name: string;
  is_inflamed: boolean;
  confidence_score: number;
}

export interface AiJointResult {
  joint_id: number;
  joint_name: string;
  probability: number;
  positive: boolean;
}

export interface AiHandResult {
  side: HandSide;
  ra_detected: boolean;
  hand_probability: number;
  num_positive_joints: number;
  num_joints_detected: number;
  joints: AiJointResult[];
  warnings: Json[];
}

export interface AnalyzeResponse {
  model_version: string | null;
  hands: AiHandResult[];
  ra_detected: boolean;
  total_positive_joints: number;
}

/** 検証済みの解析結果と、管理者向けに保存するAPIの成功レスポンス。 */
export interface AnalyzeResponseWithRaw extends AnalyzeResponse {
  raw_response: Json;
}
