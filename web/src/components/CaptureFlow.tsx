"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "@/components/ui/Link";
import { useRouter } from "next/navigation";
import CameraCapture from "@/components/CameraCapture";
import ImageQualityNotice from "@/components/ImageQualityNotice";
import { checkImageQuality } from "@/lib/check-image-quality";
import type { CapturedImage, CheckedCapture, ImageQuality } from "@/lib/image-quality";
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

function CloseIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 19 19 5M5 5l14 14" />
    </svg>
  );
}

function CaptureCancelLink() {
  return (
    <Link
      href="/"
      aria-label="撮影を中止して戻る"
      title="撮影を中止して戻る"
      className="absolute left-0 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-foreground transition-colors hover:bg-surface-hover"
    >
      <CloseIcon />
    </Link>
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
  quality,
}: {
  blob: Blob;
  label: string;
  onRetake?: () => void;
  quality?: ImageQuality;
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
      {quality && <ImageQualityNotice quality={quality} />}
      {onRetake && <Button
        type="button"
        variant="secondary"
        size="sm"
        className="mt-2 w-full"
        onClick={onRetake}
      >
        {label}を撮り直す
      </Button>}
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
  const [rightCapture, setRightCapture] = useState<CheckedCapture | null>(null);
  const [leftCapture, setLeftCapture] = useState<CheckedCapture | null>(null);
  const rightImage = rightCapture?.blob ?? null;
  const leftImage = leftCapture?.blob ?? null;
  const [pending, setPending] = useState<(CapturedImage & { quality?: ImageQuality }) | null>(null);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  const qualityTask = useRef<AbortController | null>(null);
  const pendingRef = useRef<CheckedCapture | null>(null);
  const submitting = useRef(false);

  const cancelQuality = useCallback(() => {
    qualityTask.current?.abort();
    qualityTask.current = null;
    pendingRef.current = null;
    setPending(null);
  }, []);

  useEffect(() => () => { qualityTask.current?.abort(); }, []);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<AnalysisWaitPhase>("creating");
  const [capturedNotice, setCapturedNotice] = useState<"left" | null>(null);

  const acceptCapture = useCallback(
    (capture: CheckedCapture) => {
      if (step === "left") {
        setLeftCapture(capture);
        if (rightImage) {
          setStep("confirm");
        } else {
          setCapturedNotice("left");
        }
      } else if (step === "right") {
        setRightCapture(capture);
        setStep("confirm");
      }
    },
    [step, rightImage]
  );

  const handleCapture = useCallback(async (capture: CapturedImage) => {
    cancelQuality();
    const controller = new AbortController();
    qualityTask.current = controller;
    setPending(capture);
    const quality = await checkImageQuality(capture, controller.signal);
    if (controller.signal.aborted || qualityTask.current !== controller) return;
    const checked = { ...capture, quality };
    if (quality.status === "ok") {
      cancelQuality();
      acceptCapture(checked);
    } else {
      pendingRef.current = checked;
      setPending(checked);
    }
  }, [acceptCapture, cancelQuality]);

  const usePendingCapture = useCallback(() => {
    const capture = pendingRef.current;
    if (!capture) return;
    cancelQuality();
    acceptCapture(capture);
  }, [acceptCapture, cancelQuality]);

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
    cancelQuality();
    setCameraBusy(false);
    setCameraKey((key) => key + 1);
    setLeftCapture(null);
    setRightCapture(null);
    setCapturedNotice(null);
    setError(null);
    setPhase("creating");
    setStep("left");
  }, [cancelQuality]);

  /** アップロード → AI解析まで一気に実行 */
  const submit = useCallback(async () => {
    if (!rightImage || !leftImage || pending || cameraBusy || submitting.current) return;
    submitting.current = true;
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
        throw new Error(created.error ?? "撮影記録の作成に失敗");
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
    } finally {
      submitting.current = false;
    }
  }, [rightImage, leftImage, pending, cameraBusy, router]);

  const isShooting = step === "right" || step === "left";
  const isRetaking = isShooting && Boolean(rightImage && leftImage);
  const hasPendingImages = step !== "uploading" && Boolean(rightImage || leftImage || pending || cameraBusy);
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
      <div className="relative mb-3 flex min-h-8 shrink-0 items-center justify-center gap-2 pl-9">
        <CaptureCancelLink />
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
            <div className="flex shrink-0 justify-end">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="shrink-0"
                disabled={cameraBusy}
                onClick={() => { cancelQuality(); setStep("confirm"); }}
              >
                確認に戻る
              </Button>
            </div>
          )}
          <div className={`relative min-h-0 flex-1 overflow-hidden rounded-xl ${pending ? "hidden" : ""}`}>
            <CameraCapture
              key={`${step}-${cameraKey}`}
              className="h-full min-h-[12rem]"
              handLabel={step === "left" ? "左手" : "右手"}
              instruction={
                step === "right"
                  ? "次は右手です。ガイド枠に合わせてください（手首まで写してください）"
                  : undefined
              }
              disabled={capturedNotice != null || pending != null}
              onBusyChange={setCameraBusy}
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
          {pending && (
            <div className="min-h-0 flex-1 overflow-y-auto space-y-3 rounded-xl border border-border bg-surface p-3">
              <ImagePreview blob={pending.blob} label={step === "left" ? "左手" : "右手"} />
              {pending.quality ? (
                <>
                  <div role="status" aria-live="polite"><ImageQualityNotice quality={pending.quality} /></div>
                  <Button type="button" className="w-full" onClick={cancelQuality}>撮り直す</Button>
                  <Button type="button" variant="secondary" className="w-full" onClick={usePendingCapture}>この画像を使う</Button>
                </>
              ) : <p role="status" aria-live="polite" className="text-center text-secondary-foreground">画像を確認しています</p>}
            </div>
          )}
          {cameraBusy && !pending && <p role="status" className="text-center text-sm text-secondary-foreground">画像を確認しています</p>}
        </div>
      )}

      {step === "confirm" && rightImage && leftImage && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <ImagePreview
              blob={leftImage}
              quality={leftCapture?.quality}
              label="左手"
              onRetake={() => retakeHand("left")}
            />
            <ImagePreview
              blob={rightImage}
              quality={rightCapture?.quality}
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
