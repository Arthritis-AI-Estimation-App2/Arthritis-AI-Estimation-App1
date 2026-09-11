"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  ANALYSIS_WAIT_STEPS,
  getAnalysisStepStates,
  getAnalysisWaitCopy,
  isAnalysisPipelinePhase,
  type AnalysisWaitPhase,
} from "@/lib/analysis-wait";
import {
  HAND_DIAGRAM_WIDTH,
  HAND_OUTLINE,
  JOINT_POSITIONS,
} from "@/lib/hand-diagram";
import { JOINT_NAMES } from "@/lib/joints";

/** 関節図と違い手の名前を載せないので、手首の下の余白を詰める */
const SCAN_HAND_HEIGHT = 204;

function StepIcon({ state }: { state: "done" | "current" | "pending" }) {
  if (state === "done") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <svg
          aria-hidden="true"
          className="h-3 w-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="3"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      </span>
    );
  }

  if (state === "current") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </span>
    );
  }

  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
      <span className="h-2 w-2 rounded-full bg-disabled" />
    </span>
  );
}

/** 判定結果を持たない手の図。関節は静止させ、光の帯が一度だけ通る */
function ScanningHand({ mirror = false }: { mirror?: boolean }) {
  // url(#id)参照で使うため、useIdのコロンを除く
  const scanId = useId().replace(/:/g, "");
  const clipId = `${scanId}-clip`;
  const gradientId = `${scanId}-gradient`;

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${HAND_DIAGRAM_WIDTH} ${SCAN_HAND_HEIGHT}`}
      className="w-full"
    >
      <defs>
        <clipPath id={clipId}>
          <path d={HAND_OUTLINE} />
        </clipPath>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--color-primary))" stopOpacity="0" />
          <stop offset="50%" stopColor="rgb(var(--color-primary))" stopOpacity="0.3" />
          <stop offset="100%" stopColor="rgb(var(--color-primary))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g
        transform={
          mirror ? `translate(${HAND_DIAGRAM_WIDTH} 0) scale(-1 1)` : undefined
        }
      >
        <path
          d={HAND_OUTLINE}
          fill="var(--color-joint-hand)"
          stroke="var(--color-joint-outline)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <g clipPath={`url(#${clipId})`}>
          <rect
            x="0"
            y="0"
            width={HAND_DIAGRAM_WIDTH}
            height="40"
            fill={`url(#${gradientId})`}
            className="animate-analysis-hand-scan"
          />
        </g>
        {JOINT_NAMES.map((name) => {
          const pos = JOINT_POSITIONS[name];

          return (
            <circle
              key={name}
              cx={pos.x}
              cy={pos.y}
              r="5"
              fill="var(--color-joint-marker)"
              stroke="var(--color-joint-outline)"
              strokeWidth="1.5"
            />
          );
        })}
      </g>
    </svg>
  );
}

/** 経過時間で文面を切り替える部分。`key={phase}`で段階ごとに起点を取り直す */
function WaitCopyText({
  phase,
  startedAt,
}: {
  phase: AnalysisWaitPhase;
  startedAt?: string | number;
}) {
  // サーバーとクライアントで時刻が食い違わないよう、初回は必ず経過0の文面を描く
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const parsed = startedAt != null ? new Date(startedAt).getTime() : Number.NaN;
    const baseMs = Number.isFinite(parsed) ? parsed : Date.now();
    const interval = window.setInterval(
      () => setElapsedMs(Date.now() - baseMs),
      1000
    );
    return () => window.clearInterval(interval);
  }, [startedAt]);

  const copy = getAnalysisWaitCopy(phase, elapsedMs);

  return (
    <>
      <p className="font-bold text-foreground">{copy.title}</p>
      <p className="mt-1 text-sm text-secondary-foreground">{copy.detail}</p>
    </>
  );
}

function PreviewThumbnail({ blob, label }: { blob: Blob; label: string }) {
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    const image = imageRef.current;
    if (image) image.src = objectUrl;
    return () => {
      if (image?.src === objectUrl) image.removeAttribute("src");
      URL.revokeObjectURL(objectUrl);
    };
  }, [blob]);

  return (
    <div className="text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imageRef}
        alt={`${label}の撮影画像`}
        className="h-16 w-12 rounded-md border border-border object-cover"
      />
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

interface AnalysisWaitingPanelProps {
  phase: AnalysisWaitPhase;
  /** 解析の開始時刻。省略時はこの表示を開始した時点を起点にする */
  startedAt?: string | number;
  /** 撮影直後だけ、手元の画像を「受け取った証拠」として表示する */
  previews?: { label: string; blob: Blob }[];
  /** 自動更新の案内など、画面ごとの補足 */
  note?: string;
  className?: string;
}

export default function AnalysisWaitingPanel({
  phase,
  startedAt,
  previews,
  note,
  className = "",
}: AnalysisWaitingPanelProps) {
  const stepStates = getAnalysisStepStates(phase);
  const showSteps = isAnalysisPipelinePhase(phase);

  return (
    <div
      className={`rounded-xl border border-border bg-surface p-6 ${className}`}
    >
      <div aria-hidden="true" className="mx-auto grid max-w-[15rem] grid-cols-2 gap-3">
        <ScanningHand mirror />
        <ScanningHand />
      </div>

      <div className="mt-2 text-center" role="status" aria-live="polite">
        <WaitCopyText key={phase} phase={phase} startedAt={startedAt} />

        {showSteps && (
          <ul className="mx-auto mt-4 w-max space-y-1.5 text-left">
            {ANALYSIS_WAIT_STEPS.map((step, index) => {
              const state = stepStates[index];

              return (
                <li key={step.phase} className="flex items-center gap-2 text-sm">
                  <StepIcon state={state} />
                  <span
                    className={
                      state === "pending"
                        ? "text-subtle-foreground"
                        : state === "current"
                          ? "font-medium text-foreground"
                          : "text-secondary-foreground"
                    }
                  >
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {note && <p className="mt-3 text-xs text-muted-foreground">{note}</p>}
      </div>

      {previews && previews.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-center text-xs text-muted-foreground">
            解析中の画像
          </p>
          <div className="mt-2 flex justify-center gap-3">
            {previews.map(({ label, blob }) => (
              <PreviewThumbnail key={label} blob={blob} label={label} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
