import { deleteStaff, getClinics, getStaff } from "@/app/actions/admin";
import EditStaffForm from "@/components/EditStaffForm";
import ResetStaffPasswordForm from "@/components/ResetStaffPasswordForm";
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
            表示名、所属医療機関、有効状態、パスワードを変更します。
          </p>
        </div>
        <Link href="/admin/staffs">
          <Button variant="secondary">一覧へ戻る</Button>
        </Link>
      </div>
      <EditStaffForm staff={staff} clinics={clinics} />
      <ResetStaffPasswordForm
        staffId={staff.id}
        initialPassword={generatePassword()}
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
