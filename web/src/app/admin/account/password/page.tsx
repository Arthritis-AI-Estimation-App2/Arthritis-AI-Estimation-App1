import ChangePasswordPage from "@/components/ChangePasswordPage";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const metadata = { title: "アカウント設定" };

export default async function AdminPasswordPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  return (
    <ChangePasswordPage
      backHref="/admin"
      backLabel="医療機関の管理に戻る"
      currentEmail={current.email ?? ""}
    />
  );
}
