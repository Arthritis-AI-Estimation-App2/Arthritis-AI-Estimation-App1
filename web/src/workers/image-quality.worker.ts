import { evaluateImageQuality, uncheckedQuality, type QualityRegion } from "../lib/image-quality";

self.onmessage = (event: MessageEvent<{ pixels: Uint8ClampedArray; width: number; height: number; region?: QualityRegion }>) => {
  try {
    const { pixels, width, height, region } = event.data;
    self.postMessage(evaluateImageQuality(pixels, width, height, region));
  } catch {
    self.postMessage(uncheckedQuality("processing"));
  }
};
