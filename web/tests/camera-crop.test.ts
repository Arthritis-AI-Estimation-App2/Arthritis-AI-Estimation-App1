import assert from "node:assert/strict";
import test from "node:test";
import { cameraCrop } from "../src/lib/camera-crop.ts";

test("横長の映像を縦長の撮影画面に合わせ、左右の画面外を除く", () => {
  assert.deepEqual(cameraCrop(1920, 1080, 360, 720), {
    x: 690, y: 0, width: 540, height: 1080,
  });
});

test("縦長の映像を横長の撮影画面に合わせ、上下の画面外を除く", () => {
  assert.deepEqual(cameraCrop(1080, 1920, 720, 360), {
    x: 0, y: 690, width: 1080, height: 540,
  });
});

test("同じ縦横比では映像全体を保存する", () => {
  assert.deepEqual(cameraCrop(1200, 1600, 300, 400), {
    x: 0, y: 0, width: 1200, height: 1600,
  });
});

test("小数の表示寸法でも切り出し範囲と画面の縦横比が一致する", () => {
  const crop = cameraCrop(1920, 1080, 358, 743.5);
  assert.ok(Math.abs(crop.width / crop.height - 358 / 743.5) < 1e-10);
  assert.ok(Math.abs(crop.x * 2 + crop.width - 1920) < 1e-10);
  assert.equal(crop.y, 0);
  assert.equal(crop.height, 1080);
});

test("映像の未読み込みや非表示の状態では保存できない", () => {
  for (const value of [0, -1, NaN, Infinity]) {
    for (let index = 0; index < 4; index++) {
      const dimensions: [number, number, number, number] = [1920, 1080, 360, 720];
      dimensions[index] = value;
      assert.throws(() => cameraCrop(...dimensions), /カメラの準備/);
    }
  }
});
