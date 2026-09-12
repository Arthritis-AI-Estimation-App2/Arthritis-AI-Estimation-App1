/** object-cover / object-position:center で表示される映像の範囲（元画像の座標）。 */
export function cameraCrop(
  sourceWidth: number,
  sourceHeight: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  if (![sourceWidth, sourceHeight, viewportWidth, viewportHeight].every(
    (value) => Number.isFinite(value) && value > 0,
  )) {
    throw new Error("カメラの準備ができていません");
  }

  const scale = Math.max(viewportWidth / sourceWidth, viewportHeight / sourceHeight);
  const width = viewportWidth / scale;
  const height = viewportHeight / scale;
  return {
    x: (sourceWidth - width) / 2,
    y: (sourceHeight - height) / 2,
    width,
    height,
  };
}
