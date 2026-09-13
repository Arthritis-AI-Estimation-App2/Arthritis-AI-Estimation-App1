import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import AdminNav from "@/components/AdminNav";
import UserAccountMenu from "@/components/UserAccountMenu";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");
  if (current.profile.role !== "admin") redirect("/");

  return (
    <div className="min-h-dvh bg-background pb-safe">
      <header className="border-b border-border bg-surface pt-safe">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-safe-6 py-2 lg:grid-cols-[auto_1fr_auto] lg:gap-x-6">
          <Link href="/admin" className="flex min-h-11 min-w-0 items-center gap-2 font-bold text-primary">
            <span className="truncate">関節炎スクリーニング</span>
            <span className="shrink-0 rounded bg-primary-subtle px-2 py-1 text-xs">管理</span>
          </Link>
          <div className="col-span-2 row-start-2 lg:col-span-1 lg:col-start-2 lg:row-start-1">
            <AdminNav />
          </div>
          <div className="col-start-2 row-start-1 lg:col-start-3">
            <UserAccountMenu
              displayName={current.profile.full_name}
              roleLabel="本部管理者"
              passwordHref="/admin/account/password"
            />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-safe-6 py-6">{children}</main>
    </div>
  );
}
