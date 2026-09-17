import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  analysisErrorLabel,
  parseAiApiErrorResponse,
} from "../src/lib/analysis-error.ts";

const fixture = JSON.parse(
  readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "../../api-spec/fixtures/error-no-hand-detected.json"
    ),
    "utf8"
  )
) as unknown;

test("AI APIエラー: 仕様どおりの本文から code / side / request_id を読む", () => {
  assert.deepEqual(parseAiApiErrorResponse(JSON.stringify(fixture)), {
    code: "NO_HAND_DETECTED",
    message: "No hand was detected in the image.",
    side: "left",
    requestId: "req-fixture-no-hand",
  });
});

test("AI APIエラー: side なしの既知コードも読む", () => {
  assert.deepEqual(
    parseAiApiErrorResponse(
      JSON.stringify({
        error: { code: "INFERENCE_ERROR", message: "boom" },
      })
    ),
    {
      code: "INFERENCE_ERROR",
      message: "boom",
      side: null,
      requestId: null,
    }
  );
});

test("AI APIエラー: 仕様外の本文は読まない", () => {
  assert.equal(parseAiApiErrorResponse("not-json"), null);
  assert.equal(parseAiApiErrorResponse(JSON.stringify({ message: "nope" })), null);
  assert.equal(
    parseAiApiErrorResponse(
      JSON.stringify({ error: { code: "FUTURE_CODE", message: "x" } })
    ),
    null
  );
});

test("解析エラー表示: 既知コードは日本語、未知はフォールバック", () => {
  assert.equal(analysisErrorLabel("NO_HAND_DETECTED"), "手を検出できなかった");
  assert.equal(analysisErrorLabel("api_http_error"), "AI APIのHTTPエラー");
  assert.equal(analysisErrorLabel("not-a-code"), "不明な解析エラー");
  assert.equal(analysisErrorLabel(null), null);
});
