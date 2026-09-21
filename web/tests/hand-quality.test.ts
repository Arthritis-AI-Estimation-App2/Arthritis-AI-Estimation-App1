import assert from "node:assert/strict";
import test from "node:test";
import { handQualityMask } from "../src/lib/hand-quality-mask.ts";
import { evaluateImageQuality, guideInSavedImage, validGuide, type QualityRegion } from "../src/lib/image-quality.ts";

const width = 390, height = 500;
const region = { shape: "hand", mirror: false } as const;
function image(value: (x: number, y: number) => number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = value(x, y);
    data[i + 3] = 255;
  }
  return data;
}

test("5本の指と手の甲を含み、指間・輪郭付近・前腕を除外する", () => {
  const mask = handQualityMask(width, height, false);
  const at = (x: number, y: number) => mask[Math.floor(y / 2) * width + Math.floor(x / 2)];
  for (const [x, y] of [[100, 450], [210, 220], [370, 200], [550, 220], [650, 370], [400, 600]]) {
    assert.equal(at(x, y), 1, `${x},${y}`);
  }
  for (const [x, y] of [[50, 100], [290, 200], [470, 200], [610, 240], [400, 880], [368, 31]]) {
    assert.equal(at(x, y), 0, `${x},${y}`);
  }
});

test("端末サイズや左右反転に追従し、手の甲と指の評価領域を維持", () => {
  for (const [w, h] of [[100, 128], [200, 256], [399, 512]]) {
    const right = handQualityMask(w, h, false), left = handQualityMask(w, h, true);
    assert.ok(right.reduce((sum, value) => sum + value, 0) > w * h * 0.2);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      assert.equal(right[y * w + x], left[y * w + w - 1 - x]);
    }
  }
  const guide = guideInSavedImage(
    { left: 10, top: 20, width: 400, height: 800 },
    { left: 50, top: 120, width: 312, height: 400 }, 640, 1280,
    { shape: "hand", mirror: true },
  )!;
  assert.deepEqual(guide.region, { shape: "hand", mirror: true });
  assert.equal(guide.cx, 313.6);
  assert.equal(guide.cy, 480);
  assert.equal(guide.rx, 249.6);
  assert.equal(guide.ry, 320);
});

test("背景・指間・前腕の模様や露出を変えても判定値は変化しない", () => {
  const mask = handQualityMask(width, height, false);
  const results = [0, 255, -1].map((background) => evaluateImageQuality(image((x, y) =>
    mask[y * width + x] ? 128 : background === -1 ? (x + y) % 2 * 255 : background,
  ), width, height, region));
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[0], results[2]);
  assert.deepEqual(results[0].reasons, ["blur"]);
  assert.equal(results[0].metrics!.laplacianVariance, 0);
});

test("手内部の暗所・白飛びを検出し、背景の適正露出に引きずられない", () => {
  const mask = handQualityMask(width, height, false);
  for (const [value, reason] of [[10, "dark"], [250, "bright"]] as const) {
    const result = evaluateImageQuality(image((x, y) => mask[y * width + x] ? value : 128), width, height, region);
    assert.deepEqual(result.reasons, [reason]);
  }
});

test("左右反転した手と画像の判定結果は一致する", () => {
  const original = image((x, y) => (x * 7 + y * 3) % 160 + 45);
  const flipped = image((x, y) => original[(y * width + width - 1 - x) * 4]);
  const a = evaluateImageQuality(original, width, height, region);
  const b = evaluateImageQuality(flipped, width, height, { shape: "hand", mirror: true });
  assert.deepEqual(a.reasons, b.reasons);
  assert.ok(Math.abs(a.metrics!.laplacianVariance - b.metrics!.laplacianVariance) < 1e-6);
  assert.equal(a.metrics!.meanLuminance, b.metrics!.meanLuminance);
});

test("ピンボケ相当の平滑化と縦横のブレで鮮明さが下がり警告される", () => {
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1]]) {
    const original = image((x, y) => 128 + dx * 35 * Math.sin(x * Math.PI / 4) + dy * 35 * Math.sin(y * Math.PI / 4));
    const sharp = evaluateImageQuality(original, width, height, region);
    assert.equal(sharp.status, "ok");
    // 17画素の移動平均で方向性のあるブレを作り、2方向ではピンボケ相当とする。
    let blurred = original;
    for (const [sx, sy] of [[dx, 0], [0, dy]]) {
      if (!sx && !sy) continue;
      const previous = blurred;
      blurred = image((x, y) => {
        let sum = 0;
        for (let offset = -8; offset <= 8; offset++) {
          const px = Math.max(0, Math.min(width - 1, x + offset * sx));
          const py = Math.max(0, Math.min(height - 1, y + offset * sy));
          sum += previous[(py * width + px) * 4];
        }
        return sum / 17;
      });
    }
    const result = evaluateImageQuality(blurred, width, height, region);
    assert.ok(result.metrics!.laplacianVariance < sharp.metrics!.laplacianVariance);
    assert.deepEqual(result.reasons, ["blur"]);
  }
});


test("左右それぞれで180度回転したマスクは元の行・列反転と一致する", () => {
  for (const [w, h] of [[100, 128], [200, 256], [399, 512]]) {
    for (const mirror of [false, true]) {
      const normal = handQualityMask(w, h, mirror, 0);
      const rotated = handQualityMask(w, h, mirror, 180);
      assert.deepEqual(rotated, normal.slice().reverse());
      assert.deepEqual(handQualityMask(w, h, mirror), normal);
    }
  }
});

test("左右と回転の4通りで画像と手領域が追従し、品質判定が一致する", () => {
  const original = image((x, y) => (x * 7 + y * 3) % 160 + 45);
  const baseline = evaluateImageQuality(original, width, height, region);
  for (const mirror of [false, true]) for (const rotation of [0, 180] as const) {
    const transformed = image((x, y) => {
      const rx = rotation === 180 ? width - 1 - x : x;
      const ry = rotation === 180 ? height - 1 - y : y;
      return original[(ry * width + (mirror ? width - 1 - rx : rx)) * 4];
    });
    const result = evaluateImageQuality(transformed, width, height, { ...region, mirror, rotation });
    assert.deepEqual(result.reasons, baseline.reasons);
    for (const key of ["meanLuminance", "darkRatio", "brightRatio", "laplacianVariance"] as const) {
      assert.ok(Math.abs(result.metrics![key] - baseline.metrics![key]) < 1e-6, key);
    }
    const mask = handQualityMask(width, height, mirror, rotation);
    const darkHand = evaluateImageQuality(image((x, y) => mask[y * width + x] ? 10 : 128),
      width, height, { ...region, mirror, rotation });
    assert.deepEqual(darkHand.reasons, ["dark"]);
  }
});

test("回転角は保存画像のガイドへ引き継ぎ、省略・0・180だけ受け付ける", () => {
  const bounds = { left: 0, top: 0, width, height };
  for (const rotation of [undefined, 0, 180] as const) {
    const rotatedRegion = { ...region, rotation };
    const guide = guideInSavedImage(bounds, bounds, width, height, rotatedRegion)!;
    assert.deepEqual(guide.region, rotatedRegion);
    assert.ok(validGuide(guide, width, height));
  }
  for (const rotation of [90, -180, 360, null, "180", NaN]) {
    const invalidRegion = { ...region, rotation } as unknown as QualityRegion;
    assert.equal(guideInSavedImage(bounds, bounds, width, height, invalidRegion), null);
    assert.deepEqual(evaluateImageQuality(image(() => 128), width, height, invalidRegion).reasons, ["region"]);
  }
});
