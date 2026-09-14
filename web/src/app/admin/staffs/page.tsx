import { getStaffs } from "@/app/actions/admin";
import ActiveBadge from "@/components/ActiveBadge";
import { Card, CardContent } from "@/components/ui/Card";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { roleLabel } from "@/lib/types";

export const metadata = { title: "スタッフ一覧" };

export default async function StaffsPage() {
  const staffs = await getStaffs();

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div>
          <h1 className="text-2xl font-bold text-foreground">医療機関のスタッフ一覧</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            登録されている医療機関のスタッフアカウント一覧です。
          </p>
        </div>
        <Link href="/admin/staffs/new" className="shrink-0 whitespace-nowrap">
          <Button>＋ スタッフアカウント発行</Button>
        </Link>
      </div>

      <Card>
        <CardContent>
          {staffs.length === 0 ? (
            <p className="text-sm text-muted-foreground">登録されているスタッフアカウントはありません。</p>
          ) : (
            <ul className="divide-y divide-border">
              {staffs.map((staff) => (
                <li key={staff.id} className="flex flex-col items-start justify-between gap-3 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1 break-words">
                    <p className="font-semibold text-foreground">{staff.full_name}</p>
                    <p className="break-all text-xs text-muted-foreground">
                      {staff.email ?? "メールアドレス未確認"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      所属: {staff.clinics?.name ?? "未割り当て"} | ロール: {roleLabel(staff.role)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 whitespace-nowrap">
                    <ActiveBadge isActive={staff.is_active} />
                    <Link href={`/admin/staffs/${staff.id}/edit`}>
                      <Button variant="secondary" size="sm">編集</Button>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
