import {
  AnalysisExecutionError,
  parseAiApiErrorResponse,
} from "./analysis-error.ts";
import { validateAnalyzeResponse } from "./analyze-response.ts";
import type { AnalyzeResponseWithRaw, HandSide } from "./types.ts";
import type { Json } from "./supabase/database.types.ts";

interface AiImageInput {
  side: HandSide;
  image_url: string;
}

interface RequestAiAnalysisOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function logAiApiResponse(status: number, response: unknown) {
  if (process.env.AI_API_LOG_RESPONSE !== "true") return;

  console.info(
    JSON.stringify({
      event: "ai_api_response",
      http_status: status,
      response,
    })
  );
}

export async function requestAiAnalysis(
  aiApiUrl: string,
  aiApiKey: string,
  images: readonly AiImageInput[],
  options: RequestAiAnalysisOptions = {}
): Promise<AnalyzeResponseWithRaw> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 55_000
  );

  try {
    let response: Response;
    try {
      response = await fetchImpl(
        `${aiApiUrl.replace(/\/+$/, "")}/v1/ra-screening`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${aiApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ images }),
          cache: "no-store",
          signal: controller.signal,
        }
      );
    } catch (error) {
      throw new AnalysisExecutionError(
        isAbortError(error) ? "api_timeout" : "api_network_error",
        isAbortError(error)
          ? "AI APIが55秒以内に応答しませんでした"
          : "AI APIへの接続に失敗しました",
        { cause: error }
      );
    }

    if (!response.ok) {
      let responseBody: string;
      try {
        responseBody = await response.text();
      } catch (error) {
        if (isAbortError(error)) {
          throw new AnalysisExecutionError(
            "api_timeout",
            "AI APIが55秒以内に応答しませんでした",
            { cause: error }
          );
        }
        responseBody = `[レスポンス本文の取得失敗: ${
          error instanceof Error ? error.message : String(error)
        }]`;
      }
      const apiError = parseAiApiErrorResponse(responseBody);
      throw new AnalysisExecutionError(
        apiError?.code ?? "api_http_error",
        apiError?.message || `AI APIがHTTP ${response.status}を返しました`,
        {
          httpStatus: response.status,
          apiResponseBody: responseBody,
          apiErrorSide: apiError?.side,
          apiRequestId: apiError?.requestId,
        }
      );
    }

    let value: unknown;
    let responseBody: string;
    try {
      responseBody = await response.text();
    } catch (error) {
      if (isAbortError(error)) {
        throw new AnalysisExecutionError(
          "api_timeout",
          "AI APIが55秒以内に応答しませんでした",
          { cause: error }
        );
      }
      throw new AnalysisExecutionError(
        "api_network_error",
        "AI APIのレスポンス本文を取得できませんでした",
        { cause: error }
      );
    }

    try {
      value = JSON.parse(responseBody);
    } catch (error) {
      throw new AnalysisExecutionError(
        "api_invalid_json",
        "AI APIのレスポンスをJSONとして解析できませんでした",
        { cause: error }
      );
    }

    logAiApiResponse(response.status, value);

    try {
      const analysis = validateAnalyzeResponse(
        value,
        images.map((image) => image.side)
      );
      // JSON.parseが成功した値だけを保存対象にする。URL等を含むリクエストは保存しない。
      return { ...analysis, raw_response: value as Json };
    } catch (error) {
      throw new AnalysisExecutionError(
        "api_invalid_response",
        error instanceof Error
          ? error.message
          : "AI APIのレスポンス内容が不正です",
        { cause: error }
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}
