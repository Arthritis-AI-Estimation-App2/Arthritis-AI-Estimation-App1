import assert from "node:assert/strict";
import test from "node:test";
import {
  formatJapanDate,
  formatJapanDateTime,
  formatJapanTime,
  japanCalendarDayKey,
} from "../src/lib/japan-date-time.ts";

test("UTCの撮影・解析日時を日本時間で表示する", () => {
  // UTCの大晦日15時は、日本時間では翌年元日の午前0時。
  const capturedAt = "2025-12-31T15:00:00.000Z";

  assert.equal(formatJapanDateTime(capturedAt), "2026/1/1 00:00");
  assert.equal(formatJapanDate(capturedAt), "2026/1/1");
  assert.equal(formatJapanTime(capturedAt), "00:00");
  assert.equal(
    formatJapanDateTime(capturedAt).startsWith(`${formatJapanDate(capturedAt)} `),
    true
  );
});

test("日本時間の日付グルーピングはUTCではなくAsia/Tokyoの境界を使う", () => {
  assert.equal(japanCalendarDayKey("2025-12-31T14:59:59.000Z"), "2025-12-31");
  assert.equal(japanCalendarDayKey("2025-12-31T15:00:00.000Z"), "2026-01-01");
});
