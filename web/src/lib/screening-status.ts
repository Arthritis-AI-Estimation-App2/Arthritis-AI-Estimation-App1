import type { ScreeningStatus } from "./types.ts";

export const SCREENING_STATUS_LABELS: Record<ScreeningStatus, string> = {
  uploading: "アップロード中",
  analyzing: "解析中",
  completed: "解析完了",
  failed: "解析失敗",
};
