"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseThresholdInput } from "@/lib/screening-thresholds";

export async function updateScreeningThresholds(
  _previous: { error: string | null; success: boolean },
  formData: FormData,
): Promise<{ error: string | null; success: boolean }> {
  const current = await getCurrentUser();
  if (!current || !current.profile.is_active || current.profile.role !== "admin") {
    return { error: "有効な管理者のみ判定設定を変更できます", success: false };
  }
  const thr_node = parseThresholdInput(formData.get("thr_node"));
  const thr_wrist = parseThresholdInput(formData.get("thr_wrist"));
  if (thr_node === null || thr_wrist === null) {
    return { error: "両方の閾値を0〜1の数値で入力してください", success: false };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("screening_threshold_settings")
    .update({ thr_node, thr_wrist }).eq("id", true).select("id").single();
  if (error || !data) {
    return { error: "判定設定を保存できませんでした", success: false };
  }
  revalidatePath("/admin/settings");
  return { error: null, success: true };
}
