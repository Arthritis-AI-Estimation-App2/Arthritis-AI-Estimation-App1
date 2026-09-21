import HandJointDiagram from "@/components/HandJointDiagram";
import { formatThreshold } from "@/lib/screening-thresholds";
import StatusBadge from "@/components/StatusBadge";
import { formatJapanDateTime } from "@/lib/japan-date-time";
import { JOINT_NAMES } from "@/lib/joints";
import { describeJoint, describeWarning, parseHandSummaries } from "@/lib/analysis-display";
import type { JointResult, Screening } from "@/lib/types";

interface ScreeningResultProps {
  screening: Screening;
  joints: JointResult[];
  images?: {
    right: string | null;
    left: string | null;
  };
  hideCapturedAt?: boolean;
}

/** AI判定結果の表示（スタッフ画面・管理画面で共用） */
export default function ScreeningResult({
  screening,
  joints,
  images,
  hideCapturedAt = false,
}: ScreeningResultProps) {
  const summaries = parseHandSummaries(screening.ai_hands);
  const totalPositiveJoints = screening.total_inflamed_joints;
  const handImages = [
    { side: "left", label: "左手", url: images?.left },
    { side: "right", label: "右手", url: images?.right },
  ] as const;
  const hasImages = handImages.some(({ url }) => Boolean(url));

  return (
    <div className="space-y-6">
      {!hideCapturedAt && (
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            撮影日時: {formatJapanDateTime(screening.created_at)}
          </p>
          <StatusBadge status={screening.status} />
        </div>
      )}

      {hasImages && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-secondary-foreground">撮影画像</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {handImages.map(({ side, label, url }) => (
              <div key={side} className="w-full text-center">
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer" className="block text-link hover:underline">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`${label}画像`}
                    className="aspect-[3/4] w-full rounded-lg border border-border bg-surface-muted object-contain"
                  />
                  <span className="mt-1 block text-xs">拡大表示 ↗</span>
                  </a>
                ) : (
                  <div className="flex aspect-[3/4] items-center justify-center rounded-lg border border-dashed border-border bg-surface-muted text-xs text-subtle-foreground">
                    画像なし
                  </div>
                )}
                <p className="mt-1.5 text-xs font-medium text-secondary-foreground">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {screening.status === "completed" && (
        <>
          {summaries.invalid && (
            <p role="alert" className="rounded-xl border border-warning-border bg-warning p-4 text-sm text-warning-foreground">
              保存された解析情報の一部を表示できません。
            </p>
          )}
          <div>
            <h2 className="text-lg font-bold text-foreground">関節別の解析結果</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              AIによる解析結果であり、診断ではありません。
            </p>
            <p className="mt-1 text-sm text-secondary-foreground">
              陽性関節数:{" "}
              <span className="font-semibold text-foreground">
                {totalPositiveJoints === null ? "未提供" : `${totalPositiveJoints}箇所`}
              </span>
            </p>
          </div>
          <dl className="space-y-1 text-sm text-secondary-foreground">
            <div className="flex flex-wrap gap-x-3"><dt>手関節以外の判定閾値</dt><dd>{formatThreshold(screening.analysis_thr_node)}</dd></div>
            <div className="flex flex-wrap gap-x-3"><dt>手関節の判定閾値</dt><dd>{formatThreshold(screening.analysis_thr_wrist)}</dd></div>
          </dl>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {handImages.map(({ side, label }) => {
              const summary = summaries.hands[side];
              const handJoints = joints.filter((joint) => joint.side === side);
              const jointMap = new Map(handJoints.map((joint) => [joint.joint_name, joint]));
              return (
                <section key={side} className="min-w-0 rounded-xl border border-border bg-surface p-3">
                  <h3 className="font-semibold">{label}の解析結果</h3>
                  <dl className="mt-3 space-y-2 text-sm">
                    {[
                      ["陽性関節数", summary ? `${summary.num_positive_joints}箇所` : "未提供"],
                      ["検出関節数", summary ? `${summary.num_joints_detected}箇所` : "未提供"],
                    ].map(([name, value]) => (
                      <div key={name} className="flex flex-wrap justify-between gap-x-3">
                        <dt className="text-muted-foreground">{name}</dt><dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  {summary?.detailsOmitted && handJoints.length === 0 && (
                    <p className="mt-3 text-sm text-muted-foreground">関節ごとの詳細は未提供</p>
                  )}
                  {summary && summary.warnings.length > 0 && (
                    <div className="mt-3 rounded-lg border border-warning-border bg-warning p-3 text-sm text-warning-foreground">
                      <h4 className="font-semibold">解析上の注意</h4>
                      <ul className="mt-2 space-y-3">
                        {summary.warnings.map((warning, index) => {
                          const { original, explanation } = describeWarning(warning);
                          return <li key={index} className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                            {explanation ?? original}
                            {explanation && <details className="mt-1"><summary className="cursor-pointer">原文を表示</summary><p>{original}</p></details>}
                          </li>;
                        })}
                      </ul>
                    </div>
                  )}
                  <HandJointDiagram joints={handJoints} mirror={side === "left"} currentApi={Boolean(summary)} className="mx-auto mt-3 w-full max-w-xs" />
                  <details className="mt-3 border-t border-border pt-3">
                    <summary className="cursor-pointer text-sm font-medium">{label}の全関節の詳細（15関節）</summary>
                    <ul className="mt-2 divide-y divide-border">
                      {JOINT_NAMES.map((name) => {
                        const description = describeJoint(name, jointMap.get(name), Boolean(summary));
                        return <li key={name} className={`flex flex-wrap items-center justify-between gap-2 rounded px-2 py-2 text-xs ${description.missing ? "bg-surface-muted text-muted-foreground" : "text-foreground"}`}>
                          <span>{description.label}</span>
                          <span className={description.inflamed ? "font-medium text-danger-foreground" : ""}>
                            {description.status}
                            {description.confidence !== null && <span className="ml-2">陽性確率 {description.confidence}</span>}
                          </span>
                        </li>;
                      })}
                    </ul>
                  </details>
                </section>
              );
            })}
          </div>
        </>
      )}

    </div>
  );
}
