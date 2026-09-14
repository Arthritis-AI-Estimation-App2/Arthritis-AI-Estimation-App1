import NavigationHint from "@/components/ui/NavigationHint";
import { getClinics } from "@/app/actions/admin";
import NewClinicForm from "@/components/NewClinicForm";
import { Card, CardContent } from "@/components/ui/Card";
import { formatJapanDate } from "@/lib/japan-date-time";
import Link from "next/link";

export default async function ClinicsPage() {
  const clinics = await getClinics();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">医療機関の管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          契約先の医療機関の登録および管理を行います。
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="mb-3 text-lg font-bold text-foreground">医療機関の新規登録</h2>
          <NewClinicForm />
        </div>

        <div>
          <h2 className="mb-3 text-lg font-bold text-foreground">登録済みの医療機関一覧 ({clinics.length}施設)</h2>
          <Card>
            <CardContent>
              {clinics.length === 0 ? (
                <p className="text-sm text-muted-foreground">登録されている医療機関はありません。</p>
              ) : (
                <ul className="divide-y divide-border">
                  {clinics.map((clinic) => (
                    <li key={clinic.id}>
                      <Link
                        href={`/admin/clinics/${clinic.id}`}
                        className="-mx-2 flex items-center justify-between gap-4 rounded-lg px-2 py-3 transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                      >
                        <div className="min-w-0 flex-1 break-words">
                          <p className="font-semibold text-foreground">{clinic.name}</p>
                          <p className="text-xs text-muted-foreground">
                            登録日: {formatJapanDate(clinic.created_at)}
                          </p>
                        </div>
                        <NavigationHint>詳細</NavigationHint>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
