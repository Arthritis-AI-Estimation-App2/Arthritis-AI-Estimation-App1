import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { throwSupabaseError } from "@/lib/supabase/error";
import ClinicStaffChrome from "@/components/ClinicStaffChrome";

export default async function ClinicStaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (current.profile.role === "admin") redirect("/admin");

  const supabase = await createClient();
  const { data: clinic, error } = current.profile.clinic_id
    ? await supabase.from("clinics").select("name").eq("id", current.profile.clinic_id).maybeSingle()
    : { data: null, error: null };
  if (error) throwSupabaseError(error, "所属医療機関の取得");

  return (
    <ClinicStaffChrome
      userName={current.profile.full_name}
      clinicName={clinic?.name ?? "所属医療機関未設定"}
    >
      {children}
    </ClinicStaffChrome>
  );
}
