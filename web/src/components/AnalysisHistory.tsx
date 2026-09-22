import { getAnalysisHistory } from "@/app/actions/analysis-history";
import { analysisRunJoints, analysisRunKindLabel, analysisRunSourceLabel } from "@/lib/analysis-history";
import { formatJapanDateTime } from "@/lib/japan-date-time";
import { formatThreshold } from "@/lib/screening-thresholds";
import { analysisErrorLabel } from "@/lib/analysis-error";
import type { Screening } from "@/lib/types";
import ScreeningResult from "@/components/ScreeningResult";
import StatusBadge from "@/components/StatusBadge";
import CopyJsonButton from "@/components/CopyJsonButton";
import Link from "@/components/ui/Link";

export default async function AnalysisHistory({ screening, page }: { screening: Screening; page: number }) {
  const history = await getAnalysisHistory(screening.id, page);
  return (
    <section id="analysis-history" className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-foreground">解析履歴（{history.total}件）</h2>
        <a className="text-sm text-link hover:underline" href={`/admin/screenings/history-export?id=${screening.id}`}>
          この撮影の履歴CSV
        </a>
      </div>
      <p className="text-xs text-muted-foreground">
        各回の条件と結果を保存しています。記録番号は保存済み履歴の順番です。
      </p>
      {history.runs.length === 0 && <p className="text-sm text-muted-foreground">このページに解析履歴はありません。</p>}
      {history.runs.map((run) => {
        const kindLabel = analysisRunKindLabel(run.kind);
        return (
        <details key={run.id} className="rounded-lg border border-border p-3">
          <summary className="cursor-pointer text-sm text-foreground">
            <span className="mr-2 font-semibold">記録{run.run_number}{kindLabel && `・${kindLabel}`}</span>
            <StatusBadge status={run.status} />
            <span className="mt-2 block text-xs text-secondary-foreground">
              開始: {run.started_at ? formatJapanDateTime(run.started_at) : "未記録"}
              {" ／ "}実行者: {run.executor_name ?? "未記録"}
              {" ／ "}指関節: {formatThreshold(run.analysis_thr_node)}
              {" ／ "}手首: {formatThreshold(run.analysis_thr_wrist)}
              {" ／ "}陽性関節数: {run.total_inflamed_joints ?? "未記録"}
            </span>
          </summary>
          <div className="mt-4 space-y-4 border-t border-border pt-4">
            <dl className="space-y-1 break-all text-xs text-secondary-foreground">
              {[
                ["実行ID", run.id], ["実行者ID", run.executed_by ?? "未記録"],
                ["終了", run.finished_at ? formatJapanDateTime(run.finished_at) : "未記録"],
                ["実行元", analysisRunSourceLabel(run.source)], ["モデル", run.ai_model_version ?? "未記録"],
              ].map(([label, value]) => (
                <div key={label} className="flex gap-2"><dt>{label}:</dt><dd>{value}</dd></div>
              ))}
            </dl>
            {run.status === "completed" && (
              <ScreeningResult screening={{ ...screening, ...run, id: screening.id }}
                joints={analysisRunJoints(run.joint_results)} hideCapturedAt />
            )}
            {run.status === "failed" && (
              <p className="text-sm text-danger-foreground">
                {analysisErrorLabel(run.analysis_error_code) ?? "失敗の詳細は未記録です"}
                {run.analysis_error_code && ` (${run.analysis_error_code})`}
                {run.analysis_error_http_status !== null && ` / HTTP ${run.analysis_error_http_status}`}
                {run.analysis_error_at && ` / ${formatJapanDateTime(run.analysis_error_at)}`}
              </p>
            )}
            {run.status === "analyzing" && <p className="text-sm text-muted-foreground">解析中です。</p>}
            <details className="text-xs text-secondary-foreground">
              <summary className="cursor-pointer">AI応答原文（アプリの閾値適用前）</summary>
              {run.raw_response ? <>
                <div className="mt-2 flex justify-end"><CopyJsonButton json={JSON.stringify(run.raw_response, null, 2)} /></div>
                <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-surface-muted p-3 text-foreground">{JSON.stringify(run.raw_response, null, 2)}</pre>
              </> : <p className="mt-2">応答原文は保存されていません。</p>}
            </details>
          </div>
        </details>
        );
      })}
      {history.totalPages > 1 && (
        <nav aria-label="解析履歴のページ" className="flex gap-4 text-sm text-link">
          {history.page > 1 && <Link href={`?historyPage=${history.page - 1}#analysis-history`}>前のページ</Link>}
          <span className="text-muted-foreground">{history.page} / {history.totalPages}</span>
          {history.page < history.totalPages && <Link href={`?historyPage=${history.page + 1}#analysis-history`}>次のページ</Link>}
        </nav>
      )}
    </section>
  );
}
