import assert from "node:assert/strict";
import test from "node:test";
import { getCaptureStepStates } from "../src/lib/capture-step.ts";

test("初回は左手を現在の撮影として表示する", () => {
  assert.deepEqual(
    getCaptureStepStates({
      step: "left",
      hasLeftImage: false,
      hasRightImage: false,
    }),
    { left: "current", right: "pending", confirm: "pending" }
  );
});

test("左手撮影後は左手を完了、右手を現在として表示する", () => {
  assert.deepEqual(
    getCaptureStepStates({
      step: "left",
      hasLeftImage: true,
      hasRightImage: false,
      leftCapturedNotice: true,
    }),
    { left: "complete", right: "current", confirm: "pending" }
  );
  assert.deepEqual(
    getCaptureStepStates({
      step: "right",
      hasLeftImage: true,
      hasRightImage: false,
    }),
    { left: "complete", right: "current", confirm: "pending" }
  );
});

test("両手の撮影後は確認を現在として表示する", () => {
  assert.deepEqual(
    getCaptureStepStates({
      step: "confirm",
      hasLeftImage: true,
      hasRightImage: true,
    }),
    { left: "complete", right: "complete", confirm: "current" }
  );
});

test("左手の撮り直し中は右手の完了状態を維持する", () => {
  assert.deepEqual(
    getCaptureStepStates({
      step: "left",
      hasLeftImage: true,
      hasRightImage: true,
    }),
    { left: "current", right: "complete", confirm: "pending" }
  );
});

test("右手の撮り直し中は左手の完了状態を維持する", () => {
  assert.deepEqual(
    getCaptureStepStates({
      step: "right",
      hasLeftImage: true,
      hasRightImage: true,
    }),
    { left: "complete", right: "current", confirm: "pending" }
  );
});

test("アップロード開始後は全ステップを完了として表示する", () => {
  assert.deepEqual(
    getCaptureStepStates({
      step: "uploading",
      hasLeftImage: true,
      hasRightImage: true,
    }),
    { left: "complete", right: "complete", confirm: "complete" }
  );
});
