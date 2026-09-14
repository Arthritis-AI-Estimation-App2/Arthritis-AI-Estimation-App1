import NewAdminForm from "@/components/NewAdminForm";
import BackLink from "@/components/ui/BackLink";
import { generatePassword } from "@/lib/generate-password";

export const metadata = { title: "管理者アカウント発行" };

export default function NewAdminPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <BackLink href="/admin/admins">管理者一覧に戻る</BackLink>
        <h1 className="mt-2 text-2xl font-bold text-foreground">管理者アカウント発行</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          管理画面と全医療機関のデータを操作できる管理者を追加します。
        </p>
      </div>

      <NewAdminForm initialPassword={generatePassword()} />
    </div>
  );
}
