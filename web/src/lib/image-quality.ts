import { handQualityMask } from "./hand-quality-mask.ts";

/** Provisional, warning-only settings. Changes require real-photo re-evaluation. */
export const IMAGE_QUALITY_CONFIG = {
  version: "hand-guide-v2",
  maxEdge: 512,
  minEdge: 64,
  darkMean: 40,
  darkPixel: 20,
  darkRatio: 0.6,
  brightMean: 220,
  brightPixel: 245,
  brightRatio: 0.3,
  laplacianVariance: 20,
} as const;

export const HAND_GUIDE = { width: 80, height: 128, cx: 40, cy: 64, rx: 36, ry: 58 } as const;
export interface QualityRegion { shape: "hand"; mirror: boolean }
export interface QualityGuide { cx: number; cy: number; rx: number; ry: number; region?: QualityRegion }
export interface CapturedImage { blob: Blob; guide: QualityGuide | null }
export type QualityReason = "dark" | "bright" | "blur" | "resolution" | "region" | "processing";
export interface QualityMetrics {
  meanLuminance: number;
  darkRatio: number;
  brightRatio: number;
  laplacianVariance: number;
}
export interface ImageQuality {
  status: "ok" | "warning" | "unchecked";
  reasons: QualityReason[];
  metrics: QualityMetrics | null;
  version: string;
}
export interface CheckedCapture extends CapturedImage { quality: ImageQuality }

export const QUALITY_MESSAGES: Record<QualityReason, string> = {
  dark: "暗すぎる可能性があります。明るい場所で撮り直してください。",
  bright: "明るすぎる可能性があります。照明の反射や強い光を避けて撮り直してください。",
  blur: "ぼやけている可能性があります。端末と手を固定し、ピントが合ってから撮り直してください。",
  resolution: "画像の解像度が不足しているため、品質を確認できませんでした。写真を確認して撮り直してください。",
  region: "ガイド枠の範囲を取得できず、品質を確認できませんでした。写真を確認して撮り直してください。",
  processing: "画像の品質を確認できませんでした。写真を確認し、必要に応じて撮り直してください。",
};

export function uncheckedQuality(reason: "resolution" | "region" | "processing"): ImageQuality {
  return { status: "unchecked", reasons: [reason], metrics: null, version: IMAGE_QUALITY_CONFIG.version };
}

type Rect = { left: number; top: number; width: number; height: number };
/** The saved object-cover crop is exactly the visible video viewport. */
export function guideInSavedImage(viewport: Rect, bounds: Rect, width: number, height: number, region?: QualityRegion): QualityGuide | null {
  const values = [viewport.left, viewport.top, viewport.width, viewport.height, bounds.left, bounds.top, bounds.width, bounds.height, width, height];
  if (!values.every(Number.isFinite) || [viewport.width, viewport.height, bounds.width, bounds.height, width, height].some((n) => n <= 0)) return null;
  const guide = {
    cx: (bounds.left + bounds.width / 2 - viewport.left) * width / viewport.width,
    cy: (bounds.top + bounds.height / 2 - viewport.top) * height / viewport.height,
    rx: bounds.width / 2 * width / viewport.width,
    ry: bounds.height / 2 * height / viewport.height,
    ...(region ? { region } : {}),
  };
  return validGuide(guide, width, height) ? guide : null;
}

export function debugImageGuide(width: number, height: number): QualityGuide {
  const scale = Math.min(width / HAND_GUIDE.width, height / HAND_GUIDE.height);
  return { cx: width / 2, cy: height / 2, rx: HAND_GUIDE.rx * scale, ry: HAND_GUIDE.ry * scale };
}

export function validGuide(guide: QualityGuide, width: number, height: number): boolean {
  return [guide.cx, guide.cy, guide.rx, guide.ry].every(Number.isFinite) &&
    (!guide.region || (guide.region.shape === "hand" && typeof guide.region.mirror === "boolean")) && guide.rx > 0 && guide.ry > 0 &&
    guide.cx - guide.rx >= -0.01 && guide.cy - guide.ry >= -0.01 &&
    guide.cx + guide.rx <= width + 0.01 && guide.cy + guide.ry <= height + 0.01;
}

/** Workerとテストで共有。手のガイドはviewBox全体、デバッグ画像は従来の楕円の外接矩形。 */
export function evaluateImageQuality(pixels: Uint8ClampedArray, width: number, height: number, region?: QualityRegion): ImageQuality {
  const config = IMAGE_QUALITY_CONFIG;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < config.minEdge || height < config.minEdge) return uncheckedQuality("resolution");
  if (width > config.maxEdge || height > config.maxEdge || pixels.length !== width * height * 4) return uncheckedQuality("processing");
  if (region && (region.shape !== "hand" || typeof region.mirror !== "boolean")) return uncheckedQuality("region");
  const luminance = new Float64Array(width * height);
  const mask = region ? handQualityMask(width, height, region.mirror) : new Uint8Array(width * height);
  let count = 0, sum = 0, dark = 0, bright = 0;
  // Leave a two-pixel inset so resampling at the ellipse edge is not measured.
  const rx = width / 2 - 2, ry = height / 2 - 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (region ? !mask[i] : ((x + 0.5 - width / 2) / rx) ** 2 + ((y + 0.5 - height / 2) / ry) ** 2 > 1) continue;
      const p = i * 4;
      const value = (299 * pixels[p] + 587 * pixels[p + 1] + 114 * pixels[p + 2]) / 1000;
      luminance[i] = value;
      mask[i] = 1;
      sum += value;
      dark += Number(value <= config.darkPixel);
      bright += Number(value >= config.brightPixel);
      count++;
    }
  }
  let samples = 0, lapMean = 0, lapM2 = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (!mask[i] || !mask[i - 1] || !mask[i + 1] || !mask[i - width] || !mask[i + width]) continue;
      const lap = luminance[i - 1] + luminance[i + 1] + luminance[i - width] + luminance[i + width] - 4 * luminance[i];
      const delta = lap - lapMean;
      lapMean += delta / ++samples;
      lapM2 += delta * (lap - lapMean);
    }
  }
  if (!count || !samples) return uncheckedQuality("resolution");
  const metrics: QualityMetrics = {
    meanLuminance: sum / count, darkRatio: dark / count, brightRatio: bright / count,
    laplacianVariance: Math.max(0, lapM2 / samples),
  };
  const reasons: QualityReason[] = [];
  if (metrics.meanLuminance < config.darkMean || metrics.darkRatio >= config.darkRatio) reasons.push("dark");
  if (metrics.meanLuminance > config.brightMean || metrics.brightRatio >= config.brightRatio) reasons.push("bright");
  if (!reasons.length && metrics.laplacianVariance < config.laplacianVariance) reasons.push("blur");
  return { status: reasons.length ? "warning" : "ok", reasons, metrics, version: config.version };
}
