import assert from "node:assert/strict";
import test from "node:test";
import {
  isScreeningImagePath,
  screeningImageCreatorId,
} from "../src/lib/screening-image-path.ts";

const userId = "user-1";
const screeningId = "screening-1";

test("画像パス: 作成者・記録・左右に一致するJPEGだけを受け入れる", () => {
  assert.equal(
    isScreeningImagePath(
      "user-1/screening-1/right_1720000000000.jpg",
      userId,
      screeningId,
      "right"
    ),
    true
  );
  assert.equal(
    isScreeningImagePath(
      "user-1/screening-1/left_1720000000000.jpg",
      userId,
      screeningId
    ),
    true
  );
});

test("画像パス: 他ユーザー・他記録・不正なファイル名を拒否する", () => {
  for (const path of [
    "user-2/screening-1/right_1.jpg",
    "user-1/screening-2/right_1.jpg",
    "user-1/screening-1/right_1.png",
    "user-1/screening-1/right_latest.jpg",
  ]) {
    assert.equal(isScreeningImagePath(path, userId, screeningId), false, path);
  }

  assert.equal(
    isScreeningImagePath("user-1/screening-1/left_1.jpg", userId, screeningId, "right"),
    false
  );
});

test("画像パス: 許可形式から作成者IDを取り出す", () => {
  assert.equal(
    screeningImageCreatorId("user-1/screening-1/right_1720000000000.jpg", screeningId),
    userId
  );
  assert.equal(
    screeningImageCreatorId("user-2/screening-1/left_1.jpg", screeningId),
    "user-2"
  );
});

test("画像パス: 不正な形式からは作成者IDを取り出さない", () => {
  for (const path of [
    "user-1/screening-2/right_1.jpg",
    "user-1/screening-1/right_latest.jpg",
    "screening-1/right_1.jpg",
    "/screening-1/right_1.jpg",
  ]) {
    assert.equal(screeningImageCreatorId(path, screeningId), null, path);
  }
});
