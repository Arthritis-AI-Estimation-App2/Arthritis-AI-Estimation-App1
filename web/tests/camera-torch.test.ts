import assert from "node:assert/strict";
import test from "node:test";
import { setTorch, supportsTorch } from "../src/lib/camera-torch.ts";

function trackWithCapabilities(torch?: boolean | boolean[]) {
  return { readyState: "live", getCapabilities: () => ({ torch }) } as unknown as MediaStreamTrack;
}

test("booleanとON/OFF両方を持つ配列の能力だけをライト対応とする", () => {
  for (const torch of [true, [true, false], [false, true]] as (boolean | boolean[])[]) {
    assert.equal(supportsTorch(trackWithCapabilities(torch)), true);
  }
  for (const torch of [undefined, false, [], [true], [false]] as (boolean | boolean[] | undefined)[]) {
    assert.equal(supportsTorch(trackWithCapabilities(torch)), false);
  }
});

test("能力取得が使えない場合と終了済みトラックは未対応とする", () => {
  assert.equal(supportsTorch(null), false);
  assert.equal(supportsTorch(undefined), false);
  assert.equal(supportsTorch({ readyState: "live" } as MediaStreamTrack), false);
  assert.equal(supportsTorch({
    readyState: "live",
    getCapabilities: () => { throw new Error("capabilities unavailable"); },
  } as unknown as MediaStreamTrack), false);
  assert.equal(supportsTorch({
    readyState: "ended",
    getCapabilities: () => { assert.fail("終了済みトラックの能力を取得しない"); },
  } as unknown as MediaStreamTrack), false);
});

test("ON/OFFともtorchだけの必須制約とadvanced制約を適用する", async () => {
  const calls: MediaTrackConstraints[] = [];
  const track = {
    applyConstraints: async (constraints: MediaTrackConstraints) => { calls.push(constraints); },
    getConstraints: () => { assert.fail("既存の映像制約を取得しない"); },
  } as unknown as MediaStreamTrack;
  await setTorch(track, true);
  await setTorch(track, false);
  assert.deepEqual(calls, [
    { torch: { exact: true }, advanced: [{ torch: true }] },
    { torch: { exact: false }, advanced: [{ torch: false }] },
  ]);
});

test("制約適用の失敗は呼び出し元へ返す", async () => {
  const failure = new DOMException("torch unavailable", "OverconstrainedError");
  const track = { applyConstraints: () => Promise.reject(failure) } as unknown as MediaStreamTrack;
  await assert.rejects(setTorch(track, true), (error) => error === failure);
});
