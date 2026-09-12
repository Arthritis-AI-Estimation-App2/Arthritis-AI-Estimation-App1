import { deleteAdmin, getAdmin, resetAdminPassword, updateAdminEmail } from "@/app/actions/admin";
import EditAdminForm from "@/components/EditAdminForm";
import ChangeAccountEmailForm from "@/components/ChangeAccountEmailForm";
import ResetAccountPasswordForm from "@/components/ResetAccountPasswordForm";
import DeleteAccountForm from "@/components/DeleteAccountForm";
import Button from "@/components/ui/Button";
import { generatePassword } from "@/lib/generate-password";
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
        <h1 className="text-2xl font-bold text-foreground">管理者を編集</h1>
        <Link href="/admin/admins"><Button variant="secondary">一覧へ戻る</Button></Link>
      </div>
      <p className="break-all text-xs text-muted-foreground">ID: {admin.id}</p>
      <EditAdminForm admin={admin} />
      <ChangeAccountEmailForm
        action={updateAdminEmail}
        idFieldName="admin_id"
        idFieldValue={admin.id}
        currentEmail={admin.email}
        entityLabel="管理者"
      />
      <ResetAccountPasswordForm
        action={resetAdminPassword}
        idFieldName="admin_id"
        idFieldValue={admin.id}
        initialPassword={generatePassword()}
        entityLabel="管理者"
      />
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
