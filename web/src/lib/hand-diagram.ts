import type { JointName } from "@/lib/joints";

/** 手の図の形状。関節図と解析待ちの図で共有する */

export const HAND_DIAGRAM_WIDTH = 200;
export const HAND_DIAGRAM_HEIGHT = 220;

/** 右手の甲（viewBox: 0 0 200 220）。輪郭と座標は一緒に調整する。
 * DIP / IPは指先から内側、PIPは指の中央、MCPは指の付け根に配置する。
 */
export const JOINT_POSITIONS: Record<JointName, { x: number; y: number }> = {
  thumbIP: { x: 34, y: 116 },
  thumbMCP: { x: 53, y: 141 },
  idxDIP: { x: 72, y: 48 },
  idxPIP: { x: 74, y: 77 },
  idxMCP: { x: 77, y: 115 },
  midDIP: { x: 103, y: 32 },
  midPIP: { x: 103, y: 66 },
  midMCP: { x: 104, y: 111 },
  ringDIP: { x: 133, y: 44 },
  ringPIP: { x: 132, y: 75 },
  ringMCP: { x: 130, y: 116 },
  pinkyDIP: { x: 159, y: 74 },
  pinkyPIP: { x: 157, y: 96 },
  pinkyMCP: { x: 153, y: 126 },
  wrist: { x: 105, y: 184 },
};

/** 指幅を確保し、指の間・母指球・手首を曲線でつないだ輪郭。 */
export const HAND_OUTLINE = [
  "M 73 200",
  "C 73 180 61 171 49 157",
  "C 38 144 27 127 17 110",
  "C 9 96 22 87 30 97",
  "L 51 123",
  "C 56 129 62 127 62 119",
  "C 63 100 61 64 61 40",
  "C 61 25 81 24 82 40",
  "L 85 98",
  "C 85 104 92 104 92 97",
  "L 92 24",
  "C 92 7 113 7 114 24",
  "L 115 97",
  "C 115 103 121 104 121 98",
  "L 122 36",
  "C 122 20 144 21 144 37",
  "L 142 108",
  "C 142 114 147 115 148 109",
  "L 149 68",
  "C 150 54 169 55 169 69",
  "L 166 129",
  "C 165 149 159 166 146 180",
  "C 141 186 140 192 140 200",
  "Z",
].join(" ");

export const HAND_WRIST_CENTER_X = (73 + 140) / 2;
