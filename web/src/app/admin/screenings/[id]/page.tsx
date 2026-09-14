import { staffDisplayName } from "@/lib/staff-display-name";
import { getSubjectsForScreeningCorrection } from "@/app/actions/subjects";
import { getScreeningDetail } from "@/app/actions/screenings";
import ScreeningResult from "@/components/ScreeningResult";
import RetryAnalysisButton from "@/components/RetryAnalysisButton";
import ProcessingStatusRefresh from "@/components/ProcessingStatusRefresh";
import RecoverInterruptedScreeningButton from "@/components/RecoverInterruptedScreeningButton";
import AnalysisWaitingPanel from "@/components/AnalysisWaitingPanel";
import StatusBadge from "@/components/StatusBadge";
import SubjectAssignmentEditor from "@/components/SubjectAssignmentEditor";
import DeleteScreeningForm from "@/components/DeleteScreeningForm";
import CopyJsonButton from "@/components/CopyJsonButton";
import { isProcessingStatus, isStaleProcessing } from "@/lib/screening-staleness";
import { formatJapanDateTime } from "@/lib/japan-date-time";
import { formatFullScreeningId } from "@/lib/admin-screening-filters";
import {
  ANALYSIS_ERROR_LABELS,
  type AnalysisErrorCode,
} from "@/lib/analysis-error";
import { notFound } from "next/navigation";
import BackLink from "@/components/ui/BackLink";

export const metadata = { title: "撮影記録の詳細 | 管理画面" };

export default async function AdminScreeningDetailPage({
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

  const { screening, joints, images, rawAiApiResponse, canRetryAnalysis } = detail;
  const isProcessing = isProcessingStatus(screening.status);
  const isInterrupted = isStaleProcessing(
    screening.status,
    screening.status_updated_at
  );
  const analysisErrorLabel = screening.analysis_error_code
    ? ANALYSIS_ERROR_LABELS[
        screening.analysis_error_code as AnalysisErrorCode
      ] ?? "不明な解析エラー"
    : null;

  return (
    <div className="space-y-6">
      {isProcessing && <ProcessingStatusRefresh />}
      <div>
        <BackLink href="/admin/screenings">撮影記録一覧に戻る</BackLink>
        <div className="mt-2 flex items-center gap-2.5">
          <h1 className="text-xl font-bold text-foreground">撮影記録の詳細</h1>
          <StatusBadge status={screening.status} />
        </div>
        <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
          <p>医療機関: {screening.subjects?.clinics?.name ?? screening.profiles?.clinics?.name ?? "不明"}</p>
          <p>担当者: {staffDisplayName(screening.profiles)}</p>
          <p>撮影日時: {formatJapanDateTime(screening.created_at)}</p>
          <p>
            撮影ID:{" "}
            <span className="break-all font-mono tracking-tight">
              {formatFullScreeningId(screening.id)}
            </span>
          </p>
        </div>
      </div>

      <SubjectAssignmentEditor
        screeningId={screening.id}
        currentSubjectId={screening.subject_id}
        subjects={subjects}
      />

      {screening.status === "failed" && (
        <div className="space-y-3 rounded-xl border border-danger-border bg-danger p-4">
          <p className="text-sm text-danger-foreground">
            {canRetryAnalysis
              ? "AI解析に失敗しました。"
              : "画像のアップロードが完了していないため、再解析できません。再撮影が必要です。"}
          </p>
          {canRetryAnalysis && (
            <RetryAnalysisButton screeningId={screening.id} />
          )}
        </div>
      )}

      {screening.status === "failed" && analysisErrorLabel && (
        <section className="rounded-xl border border-danger-border bg-surface p-4 text-sm">
          <h2 className="font-semibold text-foreground">AI解析エラー情報</h2>
          <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-secondary-foreground">
            <div className="contents">
              <dt className="text-muted-foreground">エラー種別</dt>
              <dd>
                {analysisErrorLabel}{" "}
                <span className="font-mono text-xs text-muted-foreground">
                  ({screening.analysis_error_code})
                </span>
              </dd>
            </div>
            {screening.analysis_error_http_status !== null && (
              <div className="contents">
                <dt className="text-muted-foreground">HTTPステータス</dt>
                <dd>{screening.analysis_error_http_status}</dd>
              </div>
            )}
            <div className="contents">
              <dt className="text-muted-foreground">発生日時</dt>
              <dd>
                {screening.analysis_error_at
                  ? formatJapanDateTime(screening.analysis_error_at)
                  : "-"}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {isProcessing && isInterrupted && (
        <div className="space-y-3 rounded-xl border border-warning-border bg-warning p-4">
          <p className="text-sm text-warning-foreground">
            最終更新から10分以上経過しているため、処理が中断している可能性があります。
          </p>
          <RecoverInterruptedScreeningButton screeningId={screening.id} />
        </div>
      )}

      {isProcessing && !isInterrupted && (
        <AnalysisWaitingPanel
          phase={screening.status === "analyzing" ? "analyzing" : "uploading"}
          startedAt={screening.status_updated_at}
          note="完了するとこの画面は自動的に更新されます"
        />
      )}

      <ScreeningResult
        screening={screening}
        joints={joints}
        images={images}
        hideCapturedAt
      />

      {screening.status === "completed" && canRetryAnalysis && (
        <RetryAnalysisButton screeningId={screening.id} confirmOverwrite />
      )}

      {screening.status === "completed" && (
        <section className="rounded-xl border border-border bg-surface p-4 text-sm">
          <h2 className="font-semibold text-foreground">AI解析情報</h2>
          <dl className="mt-3 space-y-1 text-secondary-foreground">
            <div className="flex gap-3">
              <dt className="w-20 text-muted-foreground">モデル</dt>
              <dd>
                {screening.ai_model_version ?? "未提供"}
              </dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-20 text-muted-foreground">解析日時</dt>
              <dd>{screening.analyzed_at ? formatJapanDateTime(screening.analyzed_at) : "-"}</dd>
            </div>
          </dl>
          <details className="mt-4 border-t border-border pt-4 text-xs text-secondary-foreground">
            <summary className="cursor-pointer font-medium text-muted-foreground">
              AI画像解析 レスポンスデータ
            </summary>
            {rawAiApiResponse ? (
              <>
                <div className="mt-2 flex justify-end">
                  <CopyJsonButton json={JSON.stringify(rawAiApiResponse, null, 2)} />
                </div>
                <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-surface-muted p-3 font-mono text-[11px] leading-relaxed text-foreground">
                  {JSON.stringify(rawAiApiResponse, null, 2)}
                </pre>
              </>
            ) : (
              <p className="mt-2 text-muted-foreground">
                この解析のAPIレスポンスは保存されていません。
              </p>
            )}
          </details>
        </section>
      )}

      <DeleteScreeningForm screeningId={screening.id} />
    </div>
  );
}
