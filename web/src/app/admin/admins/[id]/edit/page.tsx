import { deleteAdmin, getAdmin, resetAdminPassword, updateAdminEmail } from "@/app/actions/admin";
import EditAdminForm from "@/components/EditAdminForm";
import ChangeAccountEmailForm from "@/components/ChangeAccountEmailForm";
import ResetAccountPasswordForm from "@/components/ResetAccountPasswordForm";
import DeleteAccountForm from "@/components/DeleteAccountForm";
import BackLink from "@/components/ui/BackLink";
import { generatePassword } from "@/lib/generate-password";
import { getCurrentUser } from "@/lib/auth";
import { notFound } from "next/navigation";

export const metadata = { title: "管理者を編集" };

export default async function EditAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [admin, current] = await Promise.all([getAdmin(id), getCurrentUser()]);
  if (!admin) notFound();
  const isSelf = current?.userId === admin.id;
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <BackLink href="/admin/admins">管理者一覧に戻る</BackLink>
        <h1 className="mt-2 text-2xl font-bold text-foreground">管理者を編集</h1>
      </div>
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
