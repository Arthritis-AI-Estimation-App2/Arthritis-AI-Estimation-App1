import Link from "next/link";
import { formatScreeningId } from "@/lib/admin-screening-filters";

export default function FailedScreeningNextStep({
  canRetryAnalysis,
  screeningId,
  className,
}: {
  canRetryAnalysis: boolean;
  screeningId: string;
  className?: string;
}) {
  return (
    <div
      className={`space-y-3 rounded-xl border border-danger-border bg-danger p-4 ${className ?? ""}`}
    >
      {canRetryAnalysis ? (
        <div className="space-y-2 text-sm text-danger-foreground">
          <p>
            AI解析に失敗しました。画像は残っているので、本部の管理者にこの撮影の再解析を依頼できます。
          </p>
          <p>
            撮影ID{" "}
            <span className="font-mono text-xs">{formatScreeningId(screeningId)}</span>
            は、
            <Link href="/screenings" className="font-medium underline underline-offset-2">
              撮影記録一覧
            </Link>
            で探せます。管理者へ再解析を依頼するときも、このIDを伝えてください。待ちたくない場合は、もう一度撮影してください。
          </p>
        </div>
      ) : (
        <p className="text-sm text-danger-foreground">
          画像のアップロードが完了しませんでした。もう一度撮影してください。
        </p>
      )}
      <Link
        href="/capture"
        className={`inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
          canRetryAnalysis
            ? "border border-border-strong bg-surface text-secondary-foreground hover:bg-surface-hover"
            : "bg-primary text-primary-foreground hover:bg-primary-hover"
        }`}
      >
        もう一度撮影する
      </Link>
    </div>
  );
}
