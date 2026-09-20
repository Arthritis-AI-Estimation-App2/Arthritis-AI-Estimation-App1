import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateImageQuality, guideInSavedImage, debugImageGuide, validGuide,
  IMAGE_QUALITY_CONFIG,
} from "../src/lib/image-quality.ts";

function pixels(width: number, height: number, value: (x: number, y: number) => number) {
  const result = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    result[i] = result[i + 1] = result[i + 2] = value(x, y);
    result[i + 3] = 255;
  }
  return result;
}
const evaluate = (value: (x: number, y: number) => number) => evaluateImageQuality(pixels(128, 192, value), 128, 192);

test("暗部・明部を警告し、露出不良とぼやけの警告を重複させない", () => {
  for (const value of [0, 20, 39]) assert.deepEqual(evaluate(() => value).reasons, ["dark"]);
  for (const value of [221, 245, 255]) assert.deepEqual(evaluate(() => value).reasons, ["bright"]);
  assert.deepEqual(evaluate(() => 128).reasons, ["blur"]);
});

test("平均が適正でも黒つぶれ・白飛びの割合で警告する", () => {
  const dark = evaluate((x) => x < 80 ? 0 : 180);
  assert.ok(dark.metrics!.meanLuminance > IMAGE_QUALITY_CONFIG.darkMean);
  assert.deepEqual(dark.reasons, ["dark"]);
  const bright = evaluate((x) => x < 64 ? 255 : 100);
  assert.ok(bright.metrics!.meanLuminance < IMAGE_QUALITY_CONFIG.brightMean);
  assert.deepEqual(bright.reasons, ["bright"]);
});

test("輪郭のある画像は通過し、段階的にぼかすと鮮明さが低下する", () => {
  const width = 128, height = 192;
  let image = pixels(width, height, (x) => Math.floor(x / 4) % 2 ? 190 : 60);
  const results = [evaluateImageQuality(image, width, height)];
  // A repeated binomial blur, independent of the production Laplacian calculation.
  for (let pass = 1; pass <= 24; pass++) {
    const previous = image;
    image = pixels(width, height, (x, y) => {
      const at = (dx: number) => previous[(y * width + Math.max(0, Math.min(width - 1, x + dx))) * 4];
      return (at(-1) + 2 * at(0) + at(1)) / 4;
    });
    if (pass === 4 || pass === 24) results.push(evaluateImageQuality(image, width, height));
  }
  assert.equal(results[0].status, "ok");
  assert.ok(results[0].metrics!.laplacianVariance > results[1].metrics!.laplacianVariance);
  assert.ok(results[1].metrics!.laplacianVariance > results[2].metrics!.laplacianVariance);
  assert.deepEqual(results[2].reasons, ["blur"]);
});

test("楕円外を変更しても露出と鮮明さは変わらず、境界を輪郭として数えない", () => {
  const width = 128, height = 192;
  const inside = (x: number, y: number) => ((x + 0.5 - width / 2) / (width / 2)) ** 2 + ((y + 0.5 - height / 2) / (height / 2)) ** 2 <= 1;
  const first = evaluateImageQuality(pixels(width, height, (x, y) => inside(x, y) ? 128 : 0), width, height);
  const second = evaluateImageQuality(pixels(width, height, (x, y) => inside(x, y) ? 128 : (x + y) % 2 * 255), width, height);
  assert.deepEqual(first, second);
  assert.equal(first.metrics!.laplacianVariance, 0);
  assert.equal(first.version, "hand-guide-v3");
});

test("低解像度・不正な画素データは正常ではなく未確認", () => {
  assert.equal(evaluateImageQuality(pixels(32, 64, () => 128), 32, 64).status, "unchecked");
  assert.deepEqual(evaluateImageQuality(new Uint8ClampedArray(), 128, 128).reasons, ["processing"]);
  assert.equal(evaluateImageQuality(new Uint8ClampedArray(), NaN, 128).status, "unchecked");
});

test("ガイドの画面座標を保存画像へ対応させる（端末・回転・小数寸法）", () => {
  for (const [vw, vh, width, height] of [[360, 640, 720, 1280], [820, 900, 1166, 1280], [900, 400, 1280, 569], [358.5, 743.5, 617, 1280]]) {
    const viewport = { left: 13, top: 120, width: vw, height: vh };
    const ellipse = { left: 13 + vw * 0.2, top: 120 + vh * 0.1, width: vw * 0.6, height: vh * 0.7 };
    const guide = guideInSavedImage(viewport, ellipse, width, height)!;
    assert.ok(Math.abs(guide.cx - width * 0.5) < 1e-8);
    assert.ok(Math.abs(guide.cy - height * 0.45) < 1e-8);
    assert.ok(Math.abs(guide.rx - width * 0.3) < 1e-8);
    assert.ok(Math.abs(guide.ry - height * 0.35) < 1e-8);
  }
});

test("画面外や非表示のガイドを中央ガイドで代用しない", () => {
  const viewport = { left: 0, top: 0, width: 360, height: 640 };
  assert.equal(guideInSavedImage(viewport, { ...viewport, left: -50 }, 720, 1280), null);
  assert.equal(guideInSavedImage({ ...viewport, width: 0 }, viewport, 720, 1280), null);
});

test("ファイル選択用の5:8ガイドは画像中央に収まり、拡大して画像外へ出ない", () => {
  for (const [width, height] of [[1280, 720], [720, 1280], [1280, 1280]]) {
    const guide = debugImageGuide(width, height);
    assert.equal(guide.cx, width / 2);
    assert.equal(guide.cy, height / 2);
    assert.ok(validGuide(guide, width, height));
    assert.ok(Math.abs(guide.rx / guide.ry - 36 / 58) < 1e-8);
  }
});

test("平均輝度の境界40・220は露出警告にせず、画素の境界20・245は割合に含める", () => {
  assert.deepEqual(evaluate(() => 40).reasons, ["blur"]);
  assert.deepEqual(evaluate(() => 220).reasons, ["blur"]);
  assert.equal(evaluate(() => 20).metrics!.darkRatio, 1);
  assert.equal(evaluate(() => 245).metrics!.brightRatio, 1);
});
