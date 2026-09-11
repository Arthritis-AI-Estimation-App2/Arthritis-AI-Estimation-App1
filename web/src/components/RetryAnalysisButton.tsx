"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { retryAnalysis } from "@/app/actions/analyze";
import AnalysisWaitingPanel from "@/components/AnalysisWaitingPanel";
import Button from "@/components/ui/Button";

export default function RetryAnalysisButton({
  screeningId,
  confirmOverwrite = false,
}: {
  screeningId: string;
  confirmOverwrite?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRetry = async () => {
    if (
      confirmOverwrite &&
      !window.confirm("現在の解析結果を削除して、同じ画像で再解析します。続行しますか？")
    ) {
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const result = await retryAnalysis(screeningId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    } catch {
      setError("再解析に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <AnalysisWaitingPanel phase="analyzing" />;
  }

  return (
    <div className="space-y-2">
      <Button
        onClick={handleRetry}
        variant={confirmOverwrite ? "secondary" : "primary"}
        size={confirmOverwrite ? "sm" : "md"}
        className={confirmOverwrite ? "" : "w-full"}
      >
        再解析を実行する
      </Button>
      {error && <p className="text-sm text-danger-foreground">{error}</p>}
    </div>
  );
}
