import { getAdmins } from "@/app/actions/admin";
import { Card, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Link from "@/components/ui/Link";

export const metadata = { title: "管理者一覧" };

export default async function AdminsPage() {
  const admins = await getAdmins();
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div>
          <h1 className="text-2xl font-bold text-foreground">管理者一覧</h1>
          <p className="mt-1 text-sm text-muted-foreground">すべての管理者アカウントを確認し、表示名・メールアドレス・パスワードを変更できます。</p>
        </div>
        <Link href="/admin/admins/new" className="shrink-0 whitespace-nowrap"><Button>＋ 管理者アカウント発行</Button></Link>
      </div>
      <Card>
        <CardContent>
          {admins.length === 0 ? (
            <p className="text-sm text-muted-foreground">登録されている管理者アカウントはありません。</p>
          ) : (
            <ul className="divide-y divide-border">
              {admins.map((admin) => (
                <li key={admin.id} className="flex flex-col items-start justify-between gap-3 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1 break-words">
                    <p className="break-words font-semibold text-foreground">{admin.full_name}</p>
                    <p className="break-all text-xs text-muted-foreground">{admin.email ?? "メールアドレス未確認"}</p>
                  </div>
                  <Link href={`/admin/admins/${admin.id}/edit`} className="shrink-0 whitespace-nowrap"><Button variant="secondary" size="sm">編集</Button></Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
