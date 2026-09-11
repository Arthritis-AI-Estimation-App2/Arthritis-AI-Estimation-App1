/** 撮影後の待ち時間に表示する段階と文面 */

/** 記録作成 → アップロード → AI解析の順に進む */
export const ANALYSIS_WAIT_STEPS = [
  { phase: "creating", label: "記録の作成" },
  { phase: "uploading", label: "画像のアップロード" },
  { phase: "analyzing", label: "AI解析" },
] as const;

export type AnalysisPipelinePhase = (typeof ANALYSIS_WAIT_STEPS)[number]["phase"];

/** `cleaning`は失敗後に一時データを片付けている状態 */
export type AnalysisWaitPhase = AnalysisPipelinePhase | "cleaning";

export type AnalysisStepState = "done" | "current" | "pending";

/** Cloud Runのcold startでは30秒ほどかかるため、経過時間で文面を切り替える */
export const ANALYSIS_WAIT_SLOW_AFTER_MS = 8_000;
export const ANALYSIS_WAIT_VERY_SLOW_AFTER_MS = 20_000;

export interface AnalysisWaitCopy {
  title: string;
  detail: string;
}

export function isAnalysisPipelinePhase(
  phase: AnalysisWaitPhase
): phase is AnalysisPipelinePhase {
  return ANALYSIS_WAIT_STEPS.some((step) => step.phase === phase);
}

/** 段階ごとのチェックリストの状態。`cleaning`はパイプライン外なので全て未完了 */
export function getAnalysisStepStates(
  phase: AnalysisWaitPhase
): AnalysisStepState[] {
  const currentIndex = ANALYSIS_WAIT_STEPS.findIndex(
    (step) => step.phase === phase
  );

  return ANALYSIS_WAIT_STEPS.map((_, index) => {
    if (currentIndex < 0) return "pending";
    if (index < currentIndex) return "done";
    return index === currentIndex ? "current" : "pending";
  });
}

/** 実際の推論の内部ステップは分からないので、事実として言えることだけを出す */
export function getAnalysisWaitCopy(
  phase: AnalysisWaitPhase,
  elapsedMs = 0
): AnalysisWaitCopy {
  if (phase === "creating") {
    return {
      title: "記録を作成しています",
      detail: "まもなく画像のアップロードを開始します",
    };
  }

  if (phase === "uploading") {
    return {
      title: "画像をアップロードしています",
      detail: "通信環境によって数秒かかります",
    };
  }

  if (phase === "cleaning") {
    return {
      title: "一時データを削除しています",
      detail: "もう一度アップロードできる状態に戻しています",
    };
  }

  const elapsed = Number.isFinite(elapsedMs) ? Math.max(elapsedMs, 0) : 0;

  if (elapsed < ANALYSIS_WAIT_SLOW_AFTER_MS) {
    return {
      title: "画像を解析しています",
      detail: "通常は数秒で完了します",
    };
  }

  if (elapsed < ANALYSIS_WAIT_VERY_SLOW_AFTER_MS) {
    return {
      title: "解析に時間がかかっています",
      detail: "しばらく使われていないときは30秒ほどかかることがあります",
    };
  }

  return {
    title: "まだ解析中です",
    detail: "このままお待ちください。最大1分ほどかかることがあります",
  };
}
