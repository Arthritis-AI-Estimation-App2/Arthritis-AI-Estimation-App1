"use client";

import { useState } from "react";
import { getScreeningDetail } from "@/app/actions/screenings";
import FailedScreeningNextStep from "@/components/FailedScreeningNextStep";
import ScreeningResult from "@/components/ScreeningResult";
import Button from "@/components/ui/Button";

type Detail = NonNullable<Awaited<ReturnType<typeof getScreeningDetail>>>;

export default function GroupingScreeningDetail({ screeningId }: { screeningId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadDetail() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getScreeningDetail(screeningId);
      setDetail(result);
      if (!result) setError("撮影記録が見つからないか、閲覧権限がありません。");
    } catch {
      setError("解析結果を取得できませんでした。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <details
      className="border-t border-border"
      onToggle={(event) => {
        if (event.currentTarget.open) void loadDetail();
      }}
    >
      <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-medium text-primary hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus">
        解析結果の詳細
      </summary>
      <div className="space-y-3 border-t border-border p-3" aria-busy={loading}>
        {loading ? <p role="status" className="text-sm text-muted-foreground">読み込み中…</p> : error ? (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-danger-foreground">{error}</p>
            <Button type="button" variant="secondary" onClick={() => void loadDetail()} className="min-h-11">
              再読み込み
            </Button>
          </div>
        ) : detail && (
          <>
            {detail.screening.status === "failed" && (
              <FailedScreeningNextStep
                canRetryAnalysis={detail.canRetryAnalysis}
                screeningId={detail.screening.id}
              />
            )}
            {(detail.screening.status === "uploading" || detail.screening.status === "analyzing") && (
              <p className="text-sm text-muted-foreground">処理中です。詳細を開き直すと最新の状態を確認できます。</p>
            )}
            <ScreeningResult screening={detail.screening} joints={detail.joints} />
          </>
        )}
      </div>
    </details>
  );
}
