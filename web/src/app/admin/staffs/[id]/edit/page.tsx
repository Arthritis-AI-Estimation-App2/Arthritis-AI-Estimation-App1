import { deleteStaff, getClinics, getStaff, resetStaffPassword, updateStaffEmail } from "@/app/actions/admin";
import EditStaffForm from "@/components/EditStaffForm";
import ChangeAccountEmailForm from "@/components/ChangeAccountEmailForm";
import ResetAccountPasswordForm from "@/components/ResetAccountPasswordForm";
import DeleteAccountForm from "@/components/DeleteAccountForm";
import Button from "@/components/ui/Button";
import { generatePassword } from "@/lib/generate-password";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function EditStaffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [staff, clinics] = await Promise.all([getStaff(id), getClinics()]);
  if (!staff) notFound();

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">スタッフ情報を編集</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            表示名、所属医療機関、有効状態、ログイン用メールアドレス、パスワードを変更します。
          </p>
        </div>
        <Link href="/admin/staffs">
          <Button variant="secondary">一覧へ戻る</Button>
        </Link>
      </div>
      <EditStaffForm staff={staff} clinics={clinics} />
      <ChangeAccountEmailForm
        action={updateStaffEmail}
        idFieldName="staff_id"
        idFieldValue={staff.id}
        currentEmail={staff.email}
        entityLabel="スタッフ"
      />
      <ResetAccountPasswordForm
        action={resetStaffPassword}
        idFieldName="staff_id"
        idFieldValue={staff.id}
        initialPassword={generatePassword()}
        entityLabel="スタッフ"
      />
      <DeleteAccountForm
        action={deleteStaff}
        idFieldName="staff_id"
        idFieldValue={staff.id}
        entityLabel="スタッフ"
      />
    </div>
  );
}
