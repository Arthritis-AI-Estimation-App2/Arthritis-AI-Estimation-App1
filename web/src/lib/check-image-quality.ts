import {
  IMAGE_QUALITY_CONFIG, uncheckedQuality, validGuide,
  type CapturedImage, type ImageQuality,
} from "./image-quality.ts";

/** A cancelled result must never be adopted, even when image decoding finishes late. */
export function checkImageQuality(capture: CapturedImage, signal: AbortSignal): Promise<ImageQuality> {
  return new Promise((resolve) => {
    let finished = false;
    let worker: Worker | undefined;
    let bitmap: ImageBitmap | undefined;
    let canvas: HTMLCanvasElement | undefined;
    const finish = (result: ImageQuality) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      worker?.terminate();
      bitmap?.close();
      if (canvas) canvas.width = canvas.height = 0;
      resolve(result);
    };
    const abort = () => finish(uncheckedQuality("processing"));
    const timer = setTimeout(abort, 5000);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { abort(); return; }

    void (async () => {
      try {
        if (!capture.guide) { finish(uncheckedQuality("region")); return; }
        const decoded = await createImageBitmap(capture.blob);
        if (finished) { decoded.close(); return; }
        bitmap = decoded;
        const guide = capture.guide;
        if (!validGuide(guide, bitmap.width, bitmap.height)) { finish(uncheckedQuality("region")); return; }
        const sourceWidth = 2 * guide.rx, sourceHeight = 2 * guide.ry;
        if (Math.min(sourceWidth, sourceHeight) < IMAGE_QUALITY_CONFIG.minEdge) { finish(uncheckedQuality("resolution")); return; }
        const scale = Math.min(1, IMAGE_QUALITY_CONFIG.maxEdge / Math.max(sourceWidth, sourceHeight));
        canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(sourceWidth * scale));
        canvas.height = Math.max(1, Math.round(sourceHeight * scale));
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) { finish(uncheckedQuality("processing")); return; }
        context.drawImage(bitmap, guide.cx - guide.rx, guide.cy - guide.ry, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        worker = new Worker(new URL("../workers/image-quality.worker.ts", import.meta.url));
        worker.onmessage = (event: MessageEvent<ImageQuality>) => finish(event.data);
        worker.onerror = (event) => { event.preventDefault(); finish(uncheckedQuality("processing")); };
        worker.onmessageerror = abort;
        worker.postMessage({ pixels: data, width: canvas.width, height: canvas.height }, [data.buffer]);
      } catch {
        finish(uncheckedQuality("processing"));
      }
    })();
  });
}
