import { createClient } from "@/lib/supabase/server";
import { throwSupabaseError } from "@/lib/supabase/error";
import type { Profile } from "@/lib/types";

/** 現在ログイン中のユーザーとプロフィールを取得 */
export async function getCurrentUser(): Promise<{
  userId: string;
  profile: Profile;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, role, full_name, clinic_id, is_active, deleted_at, created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throwSupabaseError(error, "プロフィールの取得");
  if (!profile || !profile.is_active || profile.deleted_at) return null;

  return { userId: user.id, profile };
}
