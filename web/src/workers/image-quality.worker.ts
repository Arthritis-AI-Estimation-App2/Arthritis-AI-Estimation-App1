import { evaluateImageQuality, uncheckedQuality } from "../lib/image-quality";

self.onmessage = (event: MessageEvent<{ pixels: Uint8ClampedArray; width: number; height: number }>) => {
  try {
    const { pixels, width, height } = event.data;
    self.postMessage(evaluateImageQuality(pixels, width, height));
  } catch {
    self.postMessage(uncheckedQuality("processing"));
  }
};
