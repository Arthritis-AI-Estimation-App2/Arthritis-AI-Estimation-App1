"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { retryAnalysis } from "@/app/actions/analyze";
import AnalysisWaitingPanel from "@/components/AnalysisWaitingPanel";
import Button from "@/components/ui/Button";

export default function RetryAnalysisButton({
  screeningId,
  confirmRetry = false,
  currentRunId,
}: {
  screeningId: string;
  confirmRetry?: boolean;
  currentRunId: string | null;
}) {
  const router = useRouter();
  const runIdRef = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRetry = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    runIdRef.current ??= crypto.randomUUID();
    setDialogOpen(false);
    setLoading(true);
    setError(null);

    try {
      const result = await retryAnalysis(screeningId, currentRunId, runIdRef.current);
      if (result.error) {
        setError(result.error);
        return;
      }
    } catch {
      setError("再解析に失敗しました。時間をおいて再度お試しください。");
    } finally {
      submittingRef.current = false;
      router.refresh();
      setLoading(false);
    }
  };

  if (loading) {
    return <AnalysisWaitingPanel phase="analyzing" />;
  }

  return (
    <div className="space-y-2">
      <Button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (confirmRetry) {
            setDialogOpen(true);
          } else {
            void handleRetry();
          }
        }}
        variant={confirmRetry ? "secondary" : "primary"}
        size={confirmRetry ? "sm" : "md"}
        className={confirmRetry ? "" : "w-full"}
      >
        再解析を実行する
      </Button>
      <AlertDialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-40 min-h-dvh bg-foreground/40" />
          <AlertDialog.Popup
            finalFocus={triggerRef}
            className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-5 text-foreground shadow-xl"
          >
            <AlertDialog.Title className="text-lg font-bold">
              再解析を実行しますか？
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-sm leading-relaxed text-secondary-foreground">
              同じ画像で再解析し、履歴を追加します。これまでの解析結果と条件は履歴に残ります。
            </AlertDialog.Description>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDialogOpen(false)}
              >
                キャンセル
              </Button>
              <Button type="button" onClick={handleRetry}>
                再解析を実行する
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      {error && <p className="text-sm text-danger-foreground">{error}</p>}
    </div>
  );
}
