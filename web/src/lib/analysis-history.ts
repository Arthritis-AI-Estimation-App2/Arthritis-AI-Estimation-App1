import type { Json } from "./supabase/database.types";
import type { JointResult } from "./types";

export function analysisRunKindLabel(kind: string) {
  return ({ initial: "初回解析", retry: "再解析", legacy: "導入前の記録" } as Record<string, string>)[kind] ?? kind;
}

export function analysisRunSourceLabel(source: string | null) {
  return source === "api" ? "AI API" : source === "mock" ? "モック" : "未記録";
}

/** 移行元の関節行も扱い、欠損を陰性・確率0で補わない。 */
export function analysisRunJoints(value: Json | null): JointResult[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Json & JointResult => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    return typeof item.id === "string" && typeof item.screening_id === "string"
      && (item.side === "left" || item.side === "right") && typeof item.joint_name === "string"
      && typeof item.is_inflamed === "boolean" && typeof item.confidence_score === "number"
      && Number.isFinite(item.confidence_score) && item.confidence_score >= 0 && item.confidence_score <= 1;
  });
}
