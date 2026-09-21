import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isThreshold } from "@/lib/screening-thresholds";
import ScreeningThresholdForm from "@/components/ScreeningThresholdForm";

export const metadata = { title: "判定設定" };

export default async function ScreeningSettingsPage() {
  const current = await getCurrentUser();
  if (!current || current.profile.role !== "admin") redirect("/login");
  const supabase = await createClient();
  const { data, error } = await supabase.from("screening_threshold_settings")
    .select("thr_node, thr_wrist").eq("id", true).single();
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-xl font-bold text-foreground">判定設定</h1>
      {error || !data || !isThreshold(data.thr_node) || !isThreshold(data.thr_wrist)
        ? <p role="alert" className="text-danger-foreground">判定設定を取得できませんでした。</p>
        : <ScreeningThresholdForm thresholds={data} />}
    </div>
  );
}
