export type CaptureStep = "left" | "right" | "confirm" | "uploading";
export type CaptureStepKey = Exclude<CaptureStep, "uploading">;
export type CaptureStepState = "pending" | "current" | "complete";

export const CAPTURE_STEPS = [
  { key: "left", label: "左手の撮影" },
  { key: "right", label: "右手の撮影" },
  { key: "confirm", label: "確認" },
] as const satisfies ReadonlyArray<{ key: CaptureStepKey; label: string }>;

interface CaptureStepStateInput {
  step: CaptureStep;
  hasLeftImage: boolean;
  hasRightImage: boolean;
  leftCapturedNotice?: boolean;
}

export function getCaptureStepStates({
  step,
  hasLeftImage,
  hasRightImage,
  leftCapturedNotice = false,
}: CaptureStepStateInput): Record<CaptureStepKey, CaptureStepState> {
  if (step === "uploading") {
    return { left: "complete", right: "complete", confirm: "complete" };
  }

  return {
    left:
      step === "left" && !leftCapturedNotice
        ? "current"
        : hasLeftImage
          ? "complete"
          : "pending",
    right:
      step === "right" || leftCapturedNotice
        ? "current"
        : hasRightImage
          ? "complete"
          : "pending",
    confirm: step === "confirm" ? "current" : "pending",
  };
}
