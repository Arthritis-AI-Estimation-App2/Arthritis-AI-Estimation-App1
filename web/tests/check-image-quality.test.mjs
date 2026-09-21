import assert from "node:assert/strict";
import test from "node:test";
import { checkImageQuality } from "../src/lib/check-image-quality.ts";
import { debugImageGuide, evaluateImageQuality } from "../src/lib/image-quality.ts";

// Exercise real orchestration, replacing only browser IO.
async function withBrowser(run) {
  const names = ["createImageBitmap", "document", "Worker"];
  const originals = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  const stats = { closed: 0, terminated: 0, draws: [], workers: [], decode: null };
  const bitmap = { width: 800, height: 1280, close() { stats.closed++; } };
  const canvas = { width: 0, height: 0, getContext() {
    return {
      drawImage(...args) { stats.draws.push(args); },
      getImageData() { const data = new Uint8ClampedArray(canvas.width * canvas.height * 4).fill(128); return { data }; },
    };
  } };
  globalThis.createImageBitmap = async () => stats.decode ? stats.decode() : bitmap;
  globalThis.document = { createElement() { return canvas; } };
  globalThis.Worker = class {
    constructor() { stats.workers.push(this); }
    postMessage(data) { this.data = data; }
    terminate() { stats.terminated++; }
  };
  try { await run({ stats, bitmap, canvas }); }
  finally { names.forEach((name, i) => originals[i] ? Object.defineProperty(globalThis, name, originals[i]) : delete globalThis[name]); }
}
const capture = () => ({ blob: new Blob(["jpeg"]), guide: debugImageGuide(800, 1280) });
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("保存用Blobを変更せず、ガイド範囲を512px以下でWorkerへ渡し終了時に解放", async () => {
  await withBrowser(async ({ stats, bitmap, canvas }) => {
    const original = capture();
    const promise = checkImageQuality(original, new AbortController().signal);
    await tick();
    const worker = stats.workers[0];
    assert.equal(worker.data.height, 512);
    assert.ok(worker.data.width <= 512);
    assert.equal(stats.draws[0][0], bitmap);
    assert.equal(stats.draws[0][1], original.guide.cx - original.guide.rx);
    assert.equal(await original.blob.text(), "jpeg");
    worker.onmessage({ data: evaluateImageQuality(worker.data.pixels, worker.data.width, worker.data.height) });
    assert.deepEqual((await promise).reasons, ["blur"]);
    assert.equal(stats.closed, 1);
    assert.equal(stats.terminated, 1);
    assert.equal(canvas.width, 0);
  });
});

test("Worker失敗は未確認となり、再撮影できるようリソースを解放", async () => {
  await withBrowser(async ({ stats }) => {
    const promise = checkImageQuality(capture(), new AbortController().signal);
    await tick();
    stats.workers[0].onerror({ preventDefault() {} });
    assert.equal((await promise).status, "unchecked");
    assert.equal(stats.terminated, 1);
  });
});

test("離脱時の中断後にデコードが終了してもWorkerを起動せず画像を解放", async () => {
  await withBrowser(async ({ stats, bitmap }) => {
    let finishDecode;
    stats.decode = () => new Promise((resolve) => { finishDecode = resolve; });
    const controller = new AbortController();
    const promise = checkImageQuality(capture(), controller.signal);
    controller.abort();
    assert.equal((await promise).status, "unchecked");
    finishDecode(bitmap);
    await tick();
    assert.equal(stats.closed, 1);
    assert.equal(stats.workers.length, 0);
  });
});

test("Worker実行中の中断で破棄し、遅れた正常結果が未確認を上書きしない", async () => {
  await withBrowser(async ({ stats }) => {
    const controller = new AbortController();
    const promise = checkImageQuality(capture(), controller.signal);
    await tick();
    controller.abort();
    stats.workers[0].onmessage({ data: { status: "ok" } });
    assert.equal((await promise).status, "unchecked");
    assert.equal(stats.terminated, 1);
  });
});

test("ガイド取得失敗・低解像度・デコード失敗を正常扱いしない", async () => {
  await withBrowser(async ({ stats }) => {
    const signal = new AbortController().signal;
    assert.deepEqual((await checkImageQuality({ ...capture(), guide: null }, signal)).reasons, ["region"]);
    assert.deepEqual((await checkImageQuality({ ...capture(), guide: { cx: 20, cy: 20, rx: 10, ry: 10 } }, signal)).reasons, ["resolution"]);
    stats.decode = () => { throw new Error("decode failed"); };
    assert.deepEqual((await checkImageQuality(capture(), signal)).reasons, ["processing"]);
    assert.equal(stats.workers.length, 0);
  });
});

test("5秒で終わらないWorkerは未確認にし、タイムアウト後の結果を無視", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await withBrowser(async ({ stats }) => {
    const promise = checkImageQuality(capture(), new AbortController().signal);
    await tick();
    t.mock.timers.tick(5000);
    stats.workers[0].onmessage({ data: { status: "ok" } });
    assert.deepEqual((await promise).reasons, ["processing"]);
    assert.equal(stats.terminated, 1);
    assert.equal(stats.closed, 1);
  });
});


test("手のviewBoxと左右・回転情報をWorkerへ渡す", async () => {
  await withBrowser(async ({ stats }) => {
    const original = { blob: new Blob(["jpeg"]), guide: {
      cx: 400, cy: 640, rx: 312, ry: 400, region: { shape: "hand", mirror: true, rotation: 180 },
    } };
    const promise = checkImageQuality(original, new AbortController().signal);
    await tick();
    const worker = stats.workers[0];
    assert.deepEqual(worker.data.region, original.guide.region);
    assert.equal(stats.draws[0][1], 88);
    assert.equal(stats.draws[0][2], 240);
    assert.equal(stats.draws[0][3], 624);
    assert.equal(stats.draws[0][4], 800);
    worker.onmessage({ data: evaluateImageQuality(worker.data.pixels, worker.data.width, worker.data.height, worker.data.region) });
    assert.deepEqual((await promise).reasons, ["blur"]);
  });
});
