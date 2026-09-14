import ChangePasswordPage from "@/components/ChangePasswordPage";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const metadata = { title: "アカウント設定" };

export default async function ClinicStaffPasswordPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  return (
    <ChangePasswordPage
      backHref="/"
      backLabel="ホームに戻る"
      currentEmail={current.email ?? ""}
    />
  );
}
