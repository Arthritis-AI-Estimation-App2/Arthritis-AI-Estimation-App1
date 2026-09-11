/**
 * デバッグ用の画像アップロードは、選んだファイルを変換せずそのまま解析へ渡す。
 * Storage バケットと推論APIの制約を通せない画像は、劣化させて通すのではなく拒否する。
 */

/** Storage バケットの file_size_limit と ai-api の MAX_IMAGE_BYTES に合わせる。 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** ai-api の MAX_IMAGE_PIXELS に合わせる。 */
export const MAX_UPLOAD_PIXELS = 20_000_000;

export const DEBUG_UPLOAD_DECODE_FAILED_MESSAGE =
  "画像を読み込めませんでした。壊れていないJPEGファイルを選んでください。";

const REASON_SUFFIX = "無変換のまま解析するため、条件を満たすファイルだけを受け付けます。";

function formatCount(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/** 受け付けられない理由を返す。問題がなければ null。 */
export function rejectDebugUploadImage(input: {
  /** File.type。ブラウザが拡張子から推測した値なので、案内文にだけ使う。 */
  type: string;
  size: number;
  /** 先頭バイトがJPEGのSOIマーカーか。image/jpegとして登録してよいかの判断はこちらを正とする。 */
  hasJpegSignature: boolean;
  width: number;
  height: number;
}): string | null {
  const { type, size, hasJpegSignature, width, height } = input;

  if (!hasJpegSignature) {
    return `JPEG以外の画像は使えません（選択したファイル: ${type || "形式不明"}）。${REASON_SUFFIX}`;
  }

  if (size > MAX_UPLOAD_BYTES) {
    return `ファイルサイズが上限の${formatMegabytes(MAX_UPLOAD_BYTES)}を超えています（${formatMegabytes(size)}）。${REASON_SUFFIX}`;
  }

  const pixels = width * height;
  if (pixels > MAX_UPLOAD_PIXELS) {
    return `画素数が上限の${formatCount(MAX_UPLOAD_PIXELS)}ピクセルを超えています（${width}×${height} = ${formatCount(pixels)}ピクセル）。${REASON_SUFFIX}`;
  }

  return null;
}
