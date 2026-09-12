import { deleteAdmin, getAdmin } from "@/app/actions/admin";
import EditAdminForm from "@/components/EditAdminForm";
import DeleteAccountForm from "@/components/DeleteAccountForm";
import Button from "@/components/ui/Button";
import { getCurrentUser } from "@/lib/auth";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function EditAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [admin, current] = await Promise.all([getAdmin(id), getCurrentUser()]);
  if (!admin) notFound();
  const isSelf = current?.userId === admin.id;
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">管理者の表示名を編集</h1>
        <Link href="/admin/admins"><Button variant="secondary">一覧へ戻る</Button></Link>
      </div>
      <p className="break-all text-xs text-muted-foreground">ID: {admin.id}</p>
      <EditAdminForm admin={admin} />
      {!isSelf && (
        <DeleteAccountForm
          action={deleteAdmin}
          idFieldName="admin_id"
          idFieldValue={admin.id}
          entityLabel="管理者"
        />
      )}
    </div>
  );
}
