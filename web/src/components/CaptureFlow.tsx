"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import CameraCapture from "@/components/CameraCapture";
import CaptureLeaveGuard from "@/components/CaptureLeaveGuard";
import AnalysisWaitingPanel from "@/components/AnalysisWaitingPanel";
import Button from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { HAND_IMAGES_BUCKET } from "@/lib/storage";
import type { AnalysisWaitPhase } from "@/lib/analysis-wait";
import {
  abandonScreeningUpload,
  createScreening,
  updateScreeningImages,
} from "@/app/actions/screenings";
import { analyzeScreening } from "@/app/actions/analyze";
import {
  CAPTURE_STEPS,
  getCaptureStepStates,
  type CaptureStep,
} from "@/lib/capture-step";

function CheckIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="3"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

function HandCapturedNotice({
  blob,
  title,
  subtitle,
}: {
  blob: Blob;
  title: string;
  subtitle: string;
}) {
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
    <div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/55 px-4"
      role="status"
      aria-live="polite"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imageRef}
        alt=""
        className="absolute inset-0 h-full w-full object-contain opacity-40"
      />
      <div className="relative rounded-xl bg-surface px-6 py-5 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <CheckIcon className="h-7 w-7" />
        </span>
        <p className="mt-3 text-lg font-bold text-foreground">{title}</p>
        <p className="mt-1 text-sm text-secondary-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

function ImagePreview({
  blob,
  label,
  onRetake,
}: {
  blob: Blob;
  label: string;
  onRetake: () => void;
}) {
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
        alt={label}
        className="aspect-[3/4] w-full rounded-lg bg-surface-muted object-contain"
      />
      <p className="mt-1 text-sm text-secondary-foreground">{label}</p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="mt-2 w-full"
        onClick={onRetake}
      >
        {label}を撮り直す
      </Button>
    </div>
  );
}

export default function CaptureFlow({
  allowFileUpload = false,
}: {
  allowFileUpload?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<CaptureStep>("left");
  const [rightImage, setRightImage] = useState<Blob | null>(null);
  const [leftImage, setLeftImage] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<AnalysisWaitPhase>("creating");
  const [capturedNotice, setCapturedNotice] = useState<"left" | null>(null);

  const handleCapture = useCallback(
    (blob: Blob) => {
      if (step === "left") {
        setLeftImage(blob);
        if (rightImage) {
          setStep("confirm");
        } else {
          setCapturedNotice("left");
        }
      } else if (step === "right") {
        setRightImage(blob);
        setStep("confirm");
      }
    },
    [step, rightImage]
  );

  useEffect(() => {
    if (capturedNotice !== "left") return;
    const timer = window.setTimeout(() => {
      setCapturedNotice(null);
      setStep("right");
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [capturedNotice]);

  const retakeHand = useCallback((hand: "right" | "left") => {
    setError(null);
    setStep(hand);
  }, []);

  const discardDraft = useCallback(() => {
    setLeftImage(null);
    setRightImage(null);
    setCapturedNotice(null);
    setError(null);
    setPhase("creating");
    setStep("left");
  }, []);

  /** アップロード → AI解析まで一気に実行 */
  const submit = useCallback(async () => {
    if (!rightImage || !leftImage) return;
    setStep("uploading");
    setError(null);
    let screeningId: string | null = null;
    let rightPath: string | null = null;
    let leftPath: string | null = null;
    let imagesCommitted = false;

    try {
      setPhase("creating");
      const created = await createScreening();
      if (created.error || !created.screeningId) {
        throw new Error(created.error ?? "記録の作成に失敗");
      }
      screeningId = created.screeningId;

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("ログインが必要です");

      setPhase("uploading");
      const ts = Date.now();
      rightPath = user.id + "/" + screeningId + "/right_" + ts + ".jpg";
      leftPath = user.id + "/" + screeningId + "/left_" + ts + ".jpg";

      const [up1, up2] = await Promise.allSettled([
        supabase.storage.from(HAND_IMAGES_BUCKET).upload(rightPath, rightImage, {
          contentType: "image/jpeg",
        }),
        supabase.storage.from(HAND_IMAGES_BUCKET).upload(leftPath, leftImage, {
          contentType: "image/jpeg",
        }),
      ]);
      const uploadFailed =
        up1.status === "rejected" ||
        up2.status === "rejected" ||
        (up1.status === "fulfilled" && Boolean(up1.value.error)) ||
        (up2.status === "fulfilled" && Boolean(up2.value.error));
      if (uploadFailed) throw new Error("画像のアップロードに失敗しました");

      const { error: updateError } = await updateScreeningImages(
        screeningId,
        rightPath,
        leftPath
      );
      if (updateError) throw new Error(updateError);
      imagesCommitted = true;

      setPhase("analyzing");
      const { error: analyzeError } = await analyzeScreening(screeningId);
      if (analyzeError) {
        // 失敗しても画面遷移し、再実行ボタンを表示する
        router.push(`/results/${screeningId}`);
        return;
      }

      router.push(`/results/${screeningId}`);
    } catch (e) {
      let errorMessage = e instanceof Error ? e.message : "エラーが発生しました";

      if (screeningId && !imagesCommitted) {
        setPhase("cleaning");
        try {
          const cleanup = await abandonScreeningUpload(
            screeningId,
            [rightPath, leftPath].filter((path): path is string => Boolean(path))
          );
          if (cleanup.error) {
            errorMessage += "（一時データの削除にも失敗しました: " + cleanup.error + "）";
          }
        } catch {
          errorMessage += "（一時データの削除にも失敗しました）";
        }
      }

      setError(errorMessage);
      setStep("confirm");
    }
  }, [rightImage, leftImage, router]);

  const isShooting = step === "right" || step === "left";
  const isRetaking = isShooting && Boolean(rightImage && leftImage);
  const hasPendingImages = step !== "uploading" && Boolean(rightImage || leftImage);
  const stepStates = getCaptureStepStates({
    step,
    hasLeftImage: Boolean(leftImage),
    hasRightImage: Boolean(rightImage),
    leftCapturedNotice: capturedNotice === "left",
  });

  return (
    <div
      className={`mx-auto flex w-full flex-col ${
        isShooting ? "min-h-0 max-w-lg flex-1" : "max-w-md"
      }`}
    >
      <CaptureLeaveGuard active={hasPendingImages} onDiscard={discardDraft} />

      {/* ステップインジケーター */}
      <div className="mb-3 flex shrink-0 justify-center gap-2">
        {CAPTURE_STEPS.map((s, i) => {
          const state = stepStates[s.key];
          const isComplete = state === "complete";
          const isCurrent = state === "current";

          return (
            <div
              key={s.key}
              className={`flex items-center gap-1.5 text-xs ${
                isComplete || isCurrent ? "text-primary font-medium" : "text-subtle-foreground"
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full ${
                  isComplete || isCurrent
                    ? "bg-primary text-primary-foreground"
                    : "bg-disabled text-disabled-foreground"
                }`}
              >
                {isComplete ? <CheckIcon /> : i + 1}
              </span>
              {s.label}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="mb-3 shrink-0 rounded-lg border border-danger-border bg-danger p-3 text-sm text-danger-foreground">
          {error}
          <Button variant="secondary" size="sm" className="ml-3" onClick={submit}>
            再度アップロード
          </Button>
        </div>
      )}

      {isShooting && (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {isRetaking && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="shrink-0 self-start"
              onClick={() => setStep("confirm")}
            >
              確認に戻る
            </Button>
          )}
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl">
            <CameraCapture
              className="h-full min-h-[12rem]"
              handLabel={step === "left" ? "左手" : "右手"}
              instruction={
                step === "right"
                  ? "次は右手です。ガイド枠に合わせてください（手首まで写してください）"
                  : undefined
              }
              disabled={capturedNotice != null}
              allowFileUpload={allowFileUpload}
              onCapture={handleCapture}
            />
            {capturedNotice === "left" && leftImage && (
              <HandCapturedNotice
                blob={leftImage}
                title="左手を撮影しました"
                subtitle="次は右手です"
              />
            )}
          </div>
        </div>
      )}

      {step === "confirm" && rightImage && leftImage && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <ImagePreview
              blob={leftImage}
              label="左手"
              onRetake={() => retakeHand("left")}
            />
            <ImagePreview
              blob={rightImage}
              label="右手"
              onRetake={() => retakeHand("right")}
            />
          </div>
          <Button type="button" className="w-full" onClick={submit}>
            この画像で解析する
          </Button>
        </div>
      )}

      {step === "uploading" && (
        <AnalysisWaitingPanel
          phase={phase}
          previews={
            leftImage && rightImage
              ? [
                  { label: "左手", blob: leftImage },
                  { label: "右手", blob: rightImage },
                ]
              : undefined
          }
        />
      )}
    </div>
  );
}
