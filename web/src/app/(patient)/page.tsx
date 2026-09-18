import Link from "@/components/ui/Link";
import { getRecentScreenings } from "@/app/actions/screenings";
import StatusBadge from "@/components/StatusBadge";
import NavigationHint from "@/components/ui/NavigationHint";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { formatJapanDateTime } from "@/lib/japan-date-time";

export const metadata = { title: "ホーム" };

function CameraIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z"
      />
    </svg>
  );
}

function GroupIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6a1.125 1.125 0 0 1-1.125-1.125v-3.75ZM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-8.25ZM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 0 1-1.125-1.125v-2.25Z"
      />
    </svg>
  );
}

export default async function ClinicStaffHomePage() {
  const screenings = await getRecentScreenings(10);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/capture"
          className="block rounded-xl bg-primary p-6 text-center text-primary-foreground shadow-lg shadow-primary/20 transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary-foreground/15">
            <CameraIcon />
          </span>
          <p className="mt-3 text-lg font-bold">手指の画像を撮影する</p>
          <p className="mt-2 text-sm text-primary-foreground/75">被験者の両手を撮影・AI解析</p>
        </Link>
        <Link
          href="/grouping"
          className="block rounded-xl bg-info-solid p-6 text-center text-info-solid-foreground shadow-md transition hover:bg-info-solid-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-info-solid-foreground/15">
            <GroupIcon />
          </span>
          <p className="mt-3 text-lg font-bold">未割り当ての撮影記録</p>
          <p className="mt-2 text-sm text-info-solid-foreground">被験者IDに紐付けます</p>
        </Link>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-semibold text-foreground">最近の撮影</h1>
          <Link
            href="/screenings"
            className="text-sm font-medium text-link hover:underline"
          >
            すべての撮影記録
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {screenings.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              まだ撮影記録がありません
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {screenings.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/results/${s.id}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-5 py-4 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-x-4"
                  >
                    <div className="min-w-0 space-y-1">
                      {s.subject_id ? (
                        <p className="font-mono text-sm text-foreground">{s.subject_id}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground">未割り当て</p>
                      )}
                      <p className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatJapanDateTime(s.created_at)}
                      </p>
                      {s.status === "failed" && (
                        <p className="text-xs text-danger-foreground">
                          再撮影するか、詳細から次の操作を確認
                        </p>
                      )}
                    </div>
                    <div className="col-start-1 flex flex-wrap items-center gap-2 pt-0.5 sm:col-start-2 sm:pt-0">
                      <StatusBadge status={s.status} />
                      {s.status === "completed" && (
                        <span className="whitespace-nowrap text-xs font-medium text-secondary-foreground">
                          陽性関節数: {s.total_inflamed_joints}箇所
                        </span>
                      )}
                    </div>
                    <span className="col-start-2 row-start-1 row-span-2 self-center sm:col-start-3 sm:row-span-1">
                      <NavigationHint>詳細</NavigationHint>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
