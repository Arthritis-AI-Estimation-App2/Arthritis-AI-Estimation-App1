import ChangePasswordPage from "@/components/ChangePasswordPage";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminPasswordPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  return <ChangePasswordPage backHref="/admin" currentEmail={current.email ?? ""} />;
}
