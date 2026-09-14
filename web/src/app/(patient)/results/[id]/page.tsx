import { getSubjectsForScreeningCorrection } from "@/app/actions/subjects";
import { getScreeningDetail } from "@/app/actions/screenings";
import ScreeningResult from "@/components/ScreeningResult";
import SubjectAssignmentEditor from "@/components/SubjectAssignmentEditor";
import ProcessingStatusRefresh from "@/components/ProcessingStatusRefresh";
import AnalysisWaitingPanel from "@/components/AnalysisWaitingPanel";
import FailedScreeningNextStep from "@/components/FailedScreeningNextStep";
import { isProcessingStatus, isStaleProcessing } from "@/lib/screening-staleness";
import BackLink from "@/components/ui/BackLink";
import { notFound } from "next/navigation";

export const metadata = { title: "判定結果" };

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

  const back = screening.subject_id
    ? {
        href: `/subjects/${encodeURIComponent(screening.subject_id)}`,
        label: `${screening.subject_id}の判定履歴に戻る`,
      }
    : { href: "/", label: "ホームに戻る" };

  return (
    <div>
      {isProcessing && <ProcessingStatusRefresh />}
      <div className="mb-4">
        <BackLink href={back.href}>{back.label}</BackLink>
        <h1 className="mt-2 text-xl font-bold text-foreground">判定結果</h1>
      </div>
      <div className="mb-4">
        <SubjectAssignmentEditor
          screeningId={screening.id}
          currentSubjectId={screening.subject_id}
          subjects={subjects}
          capturedAt={screening.created_at}
          status={screening.status}
        />
      </div>
      {screening.status === "failed" && (
        <FailedScreeningNextStep
          className="mb-4"
          canRetryAnalysis={canRetryAnalysis}
          screeningId={screening.id}
        />
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
      <ScreeningResult screening={screening} joints={joints} hideCapturedAt />

    </div>
  );
}
