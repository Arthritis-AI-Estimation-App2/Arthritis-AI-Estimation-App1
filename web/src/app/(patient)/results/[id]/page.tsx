import { getSubjectsForScreeningCorrection } from "@/app/actions/subjects";
import { getScreeningDetail } from "@/app/actions/screenings";
import ScreeningResult from "@/components/ScreeningResult";
import SubjectAssignmentEditor from "@/components/SubjectAssignmentEditor";
import ProcessingStatusRefresh from "@/components/ProcessingStatusRefresh";
import AnalysisWaitingPanel from "@/components/AnalysisWaitingPanel";
import { isProcessingStatus, isStaleProcessing } from "@/lib/screening-staleness";
import { notFound } from "next/navigation";

export const metadata = { title: "判定結果 | 関節炎スクリーニング" };

export default async function ResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, subjects] = await Promise.all([
    getScreeningDetail(id),
    getSubjectsForScreeningCorrection(id),
  ]);
  if (!detail) notFound();

  const { screening, joints, canRetryAnalysis } = detail;
  const isProcessing = isProcessingStatus(screening.status);
  const isInterrupted = isStaleProcessing(
    screening.status,
    screening.status_updated_at
  );

  return (
    <div>
      {isProcessing && <ProcessingStatusRefresh />}
      <h2 className="mb-4 text-lg font-bold">判定結果</h2>
      {screening.status === "failed" && (
        <div className="mb-4 space-y-3 rounded-xl border border-danger-border bg-danger p-4">
          <p className="text-sm text-danger-foreground">
            {canRetryAnalysis
              ? "AI解析に失敗しました。管理者へ再解析を依頼してください。"
              : "画像のアップロードが完了しませんでした。もう一度撮影してください。"}
          </p>
        </div>
      )}
      {isProcessing && isInterrupted && (
        <div className="mb-4 rounded-xl border border-warning-border bg-warning p-4">
          <p className="text-sm text-warning-foreground">
            処理が中断している可能性があります。管理者へ復旧を依頼してください。
          </p>
        </div>
      )}
      {isProcessing && !isInterrupted && (
        <AnalysisWaitingPanel
          className="mb-4"
          phase={screening.status === "analyzing" ? "analyzing" : "uploading"}
          startedAt={screening.status_updated_at}
          note="完了するとこの画面は自動的に更新されます"
        />
      )}
      <ScreeningResult screening={screening} joints={joints} />
      <div className="mt-6">
        <SubjectAssignmentEditor
          screeningId={screening.id}
          currentSubjectId={screening.subject_id}
          subjects={subjects}
        />
      </div>
    </div>
  );
}
