import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_PIXELS,
  rejectDebugUploadImage,
} from "../src/lib/debug-upload-image.ts";

const validJpeg = {
  type: "image/jpeg",
  size: 1024,
  hasJpegSignature: true,
  width: 1200,
  height: 1600,
};

test("デバッグアップロード: 制約を満たすJPEGを受け入れる", () => {
  assert.equal(rejectDebugUploadImage(validJpeg), null);
});

test("デバッグアップロード: 上限ちょうどは受け入れる", () => {
  assert.equal(
    rejectDebugUploadImage({ ...validJpeg, size: MAX_UPLOAD_BYTES }),
    null
  );
  assert.equal(
    rejectDebugUploadImage({ ...validJpeg, width: 5000, height: 4000 }),
    null
  );
  assert.equal(5000 * 4000, MAX_UPLOAD_PIXELS);
});

test("デバッグアップロード: JPEGシグネチャがなければ拒否する", () => {
  // 拡張子からimage/jpegと推測されても、中身がJPEGでなければ受け付けない。
  const reason = rejectDebugUploadImage({ ...validJpeg, hasJpegSignature: false });
  assert.match(reason ?? "", /JPEG以外/);
  assert.match(reason ?? "", /image\/jpeg/);
});

test("デバッグアップロード: 形式が不明なファイルも案内文を返す", () => {
  const reason = rejectDebugUploadImage({
    ...validJpeg,
    type: "",
    hasJpegSignature: false,
  });
  assert.match(reason ?? "", /形式不明/);
});

test("デバッグアップロード: サイズ上限を超えたら実際の値を添えて拒否する", () => {
  const reason = rejectDebugUploadImage({
    ...validJpeg,
    size: 12 * 1024 * 1024,
  });
  assert.match(reason ?? "", /上限の10\.0MB/);
  assert.match(reason ?? "", /12\.0MB/);
});

test("デバッグアップロード: 画素数上限を超えたら寸法を添えて拒否する", () => {
  const reason = rejectDebugUploadImage({
    ...validJpeg,
    width: 8000,
    height: 6000,
  });
  assert.match(reason ?? "", /20,000,000ピクセル/);
  assert.match(reason ?? "", /8000×6000 = 48,000,000ピクセル/);
});

test("デバッグアップロード: シグネチャ不一致をサイズ超過より優先して伝える", () => {
  const reason = rejectDebugUploadImage({
    ...validJpeg,
    hasJpegSignature: false,
    size: MAX_UPLOAD_BYTES + 1,
  });
  assert.match(reason ?? "", /JPEG以外/);
});
