import assert from "node:assert/strict";
import test from "node:test";
import { requestAiAnalysis } from "../src/lib/ai-api.ts";
import {
  AnalysisExecutionError,
  createAnalysisFailureLog,
  createAnalysisFailurePersistenceLog,
  createAnalysisFailureUpdate,
} from "../src/lib/analysis-error.ts";

const IMAGES = [
  { side: "left" as const, image_url: "https://storage.example/left" },
  { side: "right" as const, image_url: "https://storage.example/right" },
];

function hand(side: "left" | "right") {
  return {
    side,
    ra_detected: side === "left",
    hand_probability: side === "left" ? 0.48 : 0.22,
    num_positive_joints: side === "left" ? 3 : 0,
    num_joints_detected: 11,
    joints: [],
    warnings: [],
  };
}

function validResponse() {
  return {
    model_version: "2026-09-08-v1",
    hands: [hand("left"), hand("right")],
    ra_detected: true,
    total_positive_joints: 3,
  };
}

function responseFetch(response: Response): typeof fetch {
  return (async () => response) as typeof fetch;
}

async function expectAnalysisError(
  promise: Promise<unknown>,
  code: AnalysisExecutionError["code"]
) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof AnalysisExecutionError);
    assert.equal(error.code, code);
    return true;
  });
}

test("AI API: v1エンドポイントへ認証付きで画像を入力順に送る", async () => {
  let requestedUrl = "";
  let requestedInit: RequestInit | undefined;
  const result = await requestAiAnalysis(
    "https://ai.example/",
    "shared-secret",
    IMAGES,
    {
      fetchImpl: (async (input, init) => {
        requestedUrl = String(input);
        requestedInit = init;
        return Response.json(validResponse());
      }) as typeof fetch,
    }
  );

  assert.equal(requestedUrl, "https://ai.example/v1/ra-screening");
  assert.equal(requestedInit?.method, "POST");
  assert.equal(requestedInit?.cache, "no-store");
  assert.deepEqual(requestedInit?.headers, {
    Authorization: "Bearer shared-secret",
    "Content-Type": "application/json",
  });
  assert.deepEqual(JSON.parse(String(requestedInit?.body)), { images: IMAGES });
  assert.equal(result.total_positive_joints, 3);
  assert.equal(result.model_version, "2026-09-08-v1");
  assert.deepEqual(result.raw_response, validResponse());
});

test("AI API: 推論時間を詳細画面用の生レスポンスに保持する", async () => {
  const response = { ...validResponse(), inference_ms: 1234 };
  const result = await requestAiAnalysis("https://ai.example", "key", IMAGES, {
    fetchImpl: responseFetch(Response.json(response)),
  });
  assert.deepEqual(result.raw_response, response);
});

test("AI API: 有効化時だけ成功レスポンスをサーバーログへ出力する", async (t) => {
  const previous = process.env.AI_API_LOG_RESPONSE;
  process.env.AI_API_LOG_RESPONSE = "true";
  t.after(() => {
    if (previous === undefined) {
      delete process.env.AI_API_LOG_RESPONSE;
    } else {
      process.env.AI_API_LOG_RESPONSE = previous;
    }
  });

  const messages: string[] = [];
  t.mock.method(console, "info", (message: string) => messages.push(message));

  await requestAiAnalysis("https://ai.example", "key", IMAGES, {
    fetchImpl: responseFetch(Response.json(validResponse())),
  });

  assert.deepEqual(JSON.parse(messages[0]), {
    event: "ai_api_response",
    http_status: 200,
    response: validResponse(),
  });
});

test("AI API: 構造化エラーの code と side を保持する", async () => {
  const body = JSON.stringify({
    error: {
      code: "NO_HAND_DETECTED",
      message: "No hand was detected.",
      side: "left",
    },
    request_id: "request-1",
  });

  await assert.rejects(
    requestAiAnalysis("https://ai.example", "key", IMAGES, {
      fetchImpl: responseFetch(
        new Response(body, {
          status: 422,
          headers: { "Content-Type": "application/json" },
        })
      ),
    }),
    (error: unknown) => {
      assert.ok(error instanceof AnalysisExecutionError);
      assert.equal(error.code, "NO_HAND_DETECTED");
      assert.equal(error.message, "No hand was detected.");
      assert.equal(error.httpStatus, 422);
      assert.equal(error.apiResponseBody, body);
      assert.equal(error.apiErrorSide, "left");
      assert.equal(error.apiRequestId, "request-1");
      return true;
    }
  );
});

test("AI API: 仕様外のHTTPエラー本文は api_http_error にする", async () => {
  await expectAnalysisError(
    requestAiAnalysis("https://ai.example", "key", IMAGES, {
      fetchImpl: responseFetch(new Response("upstream error", { status: 502 })),
    }),
    "api_http_error"
  );
});

test("AI API: 接続障害とタイムアウトを区別する", async () => {
  await expectAnalysisError(
    requestAiAnalysis("https://ai.example", "key", IMAGES, {
      fetchImpl: (async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch,
    }),
    "api_network_error"
  );

  const timeoutFetch = (async (
    _input: RequestInfo | URL,
    init?: RequestInit
  ) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    })) as typeof fetch;

  await expectAnalysisError(
    requestAiAnalysis("https://ai.example", "key", IMAGES, {
      fetchImpl: timeoutFetch,
      timeoutMs: 1,
    }),
    "api_timeout"
  );
});

test("AI API: 不正JSONと契約不一致を区別する", async () => {
  await expectAnalysisError(
    requestAiAnalysis("https://ai.example", "key", IMAGES, {
      fetchImpl: responseFetch(new Response("not-json")),
    }),
    "api_invalid_json"
  );

  await expectAnalysisError(
    requestAiAnalysis("https://ai.example", "key", IMAGES, {
      fetchImpl: responseFetch(
        Response.json({ ...validResponse(), total_positive_joints: 2 })
      ),
    }),
    "api_invalid_response"
  );
});

test("AI解析ログ: 1行JSONへ識別情報とエラー本文を含める", () => {
  const error = new AnalysisExecutionError(
    "api_http_error",
    "AI APIがHTTP 500を返しました",
    { httpStatus: 500, apiResponseBody: "line 1\nline 2" }
  );
  const log = createAnalysisFailureLog(
    "3f1f28b8-4c91-4af8-a6bc-212d55249e91",
    error,
    "2026-09-05T01:02:03.000Z"
  );
  const serialized = JSON.stringify(log);

  assert.equal(serialized.split("\n").length, 1);
  assert.equal(log.event, "ai_analysis_failed");
  assert.equal(log.error_code, "api_http_error");
  assert.equal(log.http_status, 500);
  assert.equal(log.api_error_body, "line 1\nline 2");
  assert.equal(log.api_error_side, null);
  assert.equal(log.api_request_id, null);
  assert.equal(log.occurred_at, "2026-09-05T01:02:03.000Z");
});

test("AI解析失敗: 状態と最新エラー要約を同時に保存する更新値を作る", () => {
  const error = new AnalysisExecutionError("api_timeout", "timeout");
  assert.deepEqual(
    createAnalysisFailureUpdate(error, "2026-09-05T01:02:03.000Z"),
    {
      status: "failed",
      analysis_error_code: "api_timeout",
      analysis_error_http_status: null,
      analysis_error_at: "2026-09-05T01:02:03.000Z",
    }
  );
});

test("AI解析失敗: DB保存失敗を別イベントとして構造化する", () => {
  const log = createAnalysisFailurePersistenceLog(
    "3f1f28b8-4c91-4af8-a6bc-212d55249e91",
    new Error("database unavailable"),
    "2026-09-05T01:02:04.000Z"
  );

  assert.equal(log.event, "ai_analysis_failure_persistence_failed");
  assert.equal(log.error_message, "database unavailable");
});
