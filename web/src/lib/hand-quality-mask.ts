import { CAPTURE_HAND_SEGMENTS, CAPTURE_HAND_WIDTH, CAPTURE_HAND_HEIGHT } from "./capture-hand-guide.ts";

/** 表示と同じBezier曲線を細分化する。512px以下で使い、背景を含めないよう後で侵食する。 */
function outlinePoints(): [number, number][] {
  const points: [number, number][] = [];
  let x = 0, y = 0;
  for (const segment of CAPTURE_HAND_SEGMENTS) {
    if (segment[0] === "M") {
      x = segment[1]; y = segment[2];
      points.push([x, y]);
    } else {
      const [, x1, y1, x2, y2, x3, y3] = segment;
      for (let step = 1; step <= 20; step++) {
        const t = step / 20, u = 1 - t;
        points.push([
          u ** 3 * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * x3,
          u ** 3 * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y3,
        ]);
      }
      x = x3; y = y3;
    }
  }
  return points;
}
const points = outlinePoints();

/** ガイド全体のviewBoxに対応するマスク。開いた腕の下端は閉じ、前腕は評価しない。 */
export function handQualityMask(width: number, height: number, mirror: boolean, rotation: 0 | 180 = 0): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const guideY = (y + 0.5) * CAPTURE_HAND_HEIGHT / height;
    if (guideY >= 780) continue;
    const intersections: number[] = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [ax, ay] = points[j], [bx, by] = points[i];
      if ((ay > guideY) === (by > guideY)) continue;
      intersections.push(ax + (guideY - ay) * (bx - ax) / (by - ay));
    }
    intersections.sort((a, b) => a - b);
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const start = Math.max(0, Math.ceil(intersections[i] * width / CAPTURE_HAND_WIDTH - 0.5));
      const end = Math.min(width, Math.ceil(intersections[i + 1] * width / CAPTURE_HAND_WIDTH - 0.5));
      for (let x = start; x < end; x++) mask[y * width + (mirror ? width - 1 - x : x)] = 1;
    }
  }
  // 輪郭・指間との境界から約8 viewBox単位以上を除く。最低2pxは補間の影響も避ける。
  const radius = Math.max(2, Math.ceil(8 * width / CAPTURE_HAND_WIDTH));
  const stride = width + 1;
  const integral = new Uint32Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = 0; x < width; x++) {
      sum += mask[y * width + x];
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + sum;
    }
  }
  const inner = new Uint8Array(mask.length);
  const area = (2 * radius + 1) ** 2;
  for (let y = radius; y < height - radius; y++) for (let x = radius; x < width - radius; x++) {
    const left = x - radius, right = x + radius + 1, top = y - radius, bottom = y + radius + 1;
    const sum = integral[bottom * stride + right] - integral[top * stride + right]
      - integral[bottom * stride + left] + integral[top * stride + left];
    if (sum === area) inner[y * width + x] = 1;
  }
  // 180度回転は行・列の両方を反転する。前腕の除外範囲も表示に追従する。
  return rotation === 180 ? inner.reverse() : inner;
}
