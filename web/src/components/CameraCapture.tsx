"use client";

import { useEffect, useRef, useState, useCallback, type ChangeEvent } from "react";
import Button from "@/components/ui/Button";
import { cameraCrop } from "@/lib/camera-crop";
import { debugImageGuide, guideInSavedImage, type CapturedImage, type QualityGuide } from "@/lib/image-quality";
import { CAPTURE_HAND_HEIGHT, CAPTURE_HAND_WIDTH, CAPTURE_HAND_OUTLINE } from "@/lib/capture-hand-guide";
import {
  DEBUG_UPLOAD_DECODE_FAILED_MESSAGE,
  rejectDebugUploadImage,
} from "@/lib/debug-upload-image";

interface CameraCaptureProps {
  /** 撮影完了時のコールバック（圧縮済みJPEGのBlob、またはデバッグ用に選んだJPEGファイル） */
  onCapture: (capture: CapturedImage) => void;
  onBusyChange: (busy: boolean) => void;
  handLabel: string;
  /** 左手表示用の反転フラグ */
  mirror?: boolean;
  instruction?: string;
  className?: string;
  disabled?: boolean;
  /** デバッグ用。カメラの代わりに手元のJPEGを無変換で使えるようにする */
  allowFileUpload?: boolean;
}

const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.8;

/** 表示中の映像範囲を切り出し、最大辺1280px・JPEG品質0.8に圧縮 */
async function compressImage(source: HTMLVideoElement, guideEl: SVGGraphicsElement | null, mirror: boolean): Promise<CapturedImage> {
  const viewport = source.getBoundingClientRect();
  const crop = cameraCrop(source.videoWidth, source.videoHeight, viewport.width, viewport.height);
  const canvas = document.createElement("canvas");
  const scale = Math.min(
    1,
    MAX_EDGE / Math.max(crop.width, crop.height)
  );
  canvas.width = Math.max(1, Math.round(crop.width * scale));
  canvas.height = Math.max(1, Math.round(crop.height * scale));

  const guide = guideEl
    ? guideInSavedImage(viewport, guideEl.getBoundingClientRect(), canvas.width, canvas.height, { shape: "hand", mirror })
    : null;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve({ blob, guide }) : reject(new Error("画像の変換に失敗"))),
      "image/jpeg",
      JPEG_QUALITY
    );
  });
}

async function hasJpegSignature(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 3).arrayBuffer());
  return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
}

export default function CameraCapture({
  onCapture,
  onBusyChange,
  handLabel,
  mirror = false,
  instruction,
  className = "",
  disabled = false,
  allowFileUpload = false,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const guideRef = useRef<SVGRectElement>(null);
  const captureBusyRef = useRef(false);
  const captureGeneration = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [flash, setFlash] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const flashTimerRef = useRef<number | null>(null);

  useEffect(() => () => { captureGeneration.current++; }, []);

  useEffect(() => {
    let cancelled = false;
    let attemptStream: MediaStream | null = null;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1920 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        attemptStream = stream;
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        if (!cancelled) {
          setError("カメラにアクセスできません。設定からカメラのアクセスを許可してください。");
        }
      }
    }

    startCamera();
    return () => {
      cancelled = true;
      attemptStream?.getTracks().forEach((t) => t.stop());
      if (streamRef.current === attemptStream) streamRef.current = null;
      if (flashTimerRef.current != null) window.clearTimeout(flashTimerRef.current);
    };
  }, [cameraAttempt]);

  const retryCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setReady(false);
    setError(null);
    setFileError(null);
    setCameraAttempt((attempt) => attempt + 1);
  }, []);

  const handleCapture = useCallback(async () => {
    if (!videoRef.current || captureBusyRef.current || disabled) return;
    captureBusyRef.current = true;
    const generation = ++captureGeneration.current;
    onBusyChange(true);
    setCapturing(true);
    setFileError(null);
    setFlash(true);
    if (flashTimerRef.current != null) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setFlash(false), 140);
    try {
      const capture = await compressImage(videoRef.current, guideRef.current, mirror);
      if (generation === captureGeneration.current) onCapture(capture);
    } catch {
      if (generation !== captureGeneration.current) return;
      setError("撮影に失敗しました。もう一度お試しください。");
    } finally {
      if (generation === captureGeneration.current) {
        captureBusyRef.current = false;
        setCapturing(false);
        onBusyChange(false);
      }
    }
  }, [onCapture, onBusyChange, disabled, mirror]);

  /** デバッグ用。解析結果を手元と突き合わせられるよう、選んだJPEGを変換せずそのまま渡す。 */
  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      input.value = ""; // 同じファイルを続けて選べるようにする
      if (!file || captureBusyRef.current || disabled) return;

      captureBusyRef.current = true;
      const generation = ++captureGeneration.current;
      onBusyChange(true);
      setCapturing(true);
      setFileError(null);
      try {
        const signature = await hasJpegSignature(file);
        const bitmap = await createImageBitmap(file);
        let reason: string | null;
        let guide: QualityGuide;
        try {
          guide = debugImageGuide(bitmap.width, bitmap.height);
          reason = rejectDebugUploadImage({
            type: file.type,
            size: file.size,
            hasJpegSignature: signature,
            width: bitmap.width,
            height: bitmap.height,
          });
        } finally {
          bitmap.close();
        }

        if (generation !== captureGeneration.current) return;
        if (reason) {
          setFileError(reason);
          return;
        }
        onCapture({ blob: file, guide });
      } catch {
        if (generation !== captureGeneration.current) return;
        setFileError(DEBUG_UPLOAD_DECODE_FAILED_MESSAGE);
      } finally {
        if (generation === captureGeneration.current) {
          captureBusyRef.current = false;
          setCapturing(false);
          onBusyChange(false);
        }
      }
    },
    [onCapture, onBusyChange, disabled]
  );

  const fileInput = allowFileUpload ? (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/jpeg"
      className="hidden"
      onChange={handleFileChange}
    />
  ) : null;

  const openFilePicker = () => fileInputRef.current?.click();

  const fileErrorMessage = fileError ? (
    <p
      role="alert"
      className="rounded-lg border border-danger-border bg-danger px-3 py-2 text-xs text-danger-foreground"
    >
      {fileError}
    </p>
  ) : null;

  // カメラ権限拒否時のフォールバックUI
  if (error) {
    return (
      <div className={`flex flex-col items-center gap-4 rounded-xl border border-danger-border bg-danger p-8 text-center ${className}`}>
        <p className="text-danger-foreground">{error}</p>
        {fileErrorMessage}
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="secondary" onClick={retryCamera}>
            再試行
          </Button>
          {allowFileUpload && (
            <Button variant="secondary" disabled={capturing || disabled} onClick={openFilePicker}>
              {handLabel}の画像を選択
            </Button>
          )}
        </div>
        {fileInput}
      </div>
    );
  }

  return (
    <div className={`relative min-h-[12rem] overflow-hidden rounded-xl bg-black ${className}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onLoadedData={() => setReady(true)}
        onEmptied={() => setReady(false)}
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
      {/* SVGを全幅に広げ、輪郭の横幅をカメラ領域の約90%にする。高さが足りない場合は縮小する。 */}
      <div className="pointer-events-none absolute inset-0 flex flex-col gap-5 pt-4">
        <div className="z-10 shrink-0 px-3 text-center">
          <span className="inline-block rounded-full bg-black/60 px-4 py-1.5 text-sm font-medium text-white">
            {instruction ??
              `${handLabel}をガイド枠に合わせてください（手首まで写してください）`}
          </span>
        </div>
        {/* 案内文の折り返し分も確保してから、その下にガイドを配置する。 */}
        <div className="flex min-h-0 flex-1 items-center justify-center pb-[max(5rem,calc(env(safe-area-inset-bottom)+4rem))]">
          <svg
            viewBox={`0 0 ${CAPTURE_HAND_WIDTH} ${CAPTURE_HAND_HEIGHT}`}
            className="h-full w-full"
            preserveAspectRatio="xMidYMax meet"
            aria-hidden="true"
          >
            {/* 下寄せ後のviewBoxの実表示範囲を使い、余白・左右反転と判定座標を揃える。 */}
            <rect ref={guideRef} width={CAPTURE_HAND_WIDTH} height={CAPTURE_HAND_HEIGHT} fill="none" />
            <g transform={mirror ? `translate(${CAPTURE_HAND_WIDTH} 0) scale(-1 1)` : undefined}>
              <path
                d={CAPTURE_HAND_OUTLINE}
                fill="none"
                stroke="white"
                strokeOpacity="0.8"
                strokeWidth="4"
                strokeDasharray="10 8"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          </svg>
        </div>
      </div>
      {flash && (
        <div className="pointer-events-none absolute inset-0 z-10 bg-white/80" aria-hidden="true" />
      )}
      {fileErrorMessage && (
        <div className="absolute bottom-24 left-0 right-0 z-10 mx-auto max-w-sm px-3">
          {fileErrorMessage}
        </div>
      )}
      <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-0 right-0 z-10 flex justify-center">
        {allowFileUpload && (
          <button
            type="button"
            onClick={openFilePicker}
            disabled={capturing || disabled}
            aria-label={`${handLabel}の画像をファイルから選択`}
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full border border-white/70 bg-black/60 px-4 py-2 text-sm font-medium text-white transition hover:bg-black/80 disabled:opacity-40"
          >
            画像を選択
          </button>
        )}
        <button
          onClick={handleCapture}
          disabled={!ready || capturing || disabled}
          aria-label={`${handLabel}を撮影`}
          className="h-16 w-16 rounded-full border-4 border-white bg-white/30 transition hover:bg-white/50 disabled:opacity-40"
        />
      </div>
      {fileInput}
    </div>
  );
}
