export const ANALYSIS_ERROR_CODES = [
  "analysis_interrupted",
  "missing_images",
  "signed_url_failed",
  "api_configuration_error",
  "threshold_configuration_error",
  "api_timeout",
  "api_network_error",
  "api_http_error",
  "api_invalid_json",
  "api_invalid_response",
  "result_save_failed",
  "unknown",
  "UNAUTHORIZED",
  "IMAGE_TOO_LARGE",
  "UNSUPPORTED_IMAGE_TYPE",
  "INVALID_REQUEST",
  "INVALID_IMAGE",
  "NO_HAND_DETECTED",
  "IMAGE_FETCH_FAILED",
  "IMAGE_FETCH_TIMEOUT",
  "INFERENCE_ERROR",
] as const;

export type AnalysisErrorCode = (typeof ANALYSIS_ERROR_CODES)[number];

export const ANALYSIS_ERROR_LABELS: Record<AnalysisErrorCode, string> = {
  analysis_interrupted: "解析の中断",
  missing_images: "解析対象の画像不足",
  signed_url_failed: "画像参照URLの発行失敗",
  api_configuration_error: "AI APIの設定不備",
  threshold_configuration_error: "判定設定の取得失敗",
  api_timeout: "AI APIのタイムアウト",
  api_network_error: "AI APIへの接続失敗",
  api_http_error: "AI APIのHTTPエラー",
  api_invalid_json: "AI APIのJSON形式不正",
  api_invalid_response: "AI APIのレスポンス内容不正",
  result_save_failed: "解析結果の保存失敗",
  unknown: "不明な解析エラー",
  UNAUTHORIZED: "AI APIの認証失敗",
  IMAGE_TOO_LARGE: "画像サイズまたは画素数の上限超過",
  UNSUPPORTED_IMAGE_TYPE: "JPEG・PNG以外の画像",
  INVALID_REQUEST: "AI APIへのリクエスト形式不正",
  INVALID_IMAGE: "破損画像",
  NO_HAND_DETECTED: "手を検出できなかった",
  IMAGE_FETCH_FAILED: "解析用画像の取得失敗",
  IMAGE_FETCH_TIMEOUT: "解析用画像の取得タイムアウト",
  INFERENCE_ERROR: "AI APIの推論エラー",
};

const ANALYSIS_ERROR_CODE_SET = new Set<string>(ANALYSIS_ERROR_CODES);

export function isAnalysisErrorCode(value: string): value is AnalysisErrorCode {
  return ANALYSIS_ERROR_CODE_SET.has(value);
}

export function analysisErrorLabel(code: string | null | undefined) {
  if (!code) return null;
  return isAnalysisErrorCode(code) ? ANALYSIS_ERROR_LABELS[code] : "不明な解析エラー";
}

const AI_API_ERROR_CODES = [
  "UNAUTHORIZED",
  "IMAGE_TOO_LARGE",
  "UNSUPPORTED_IMAGE_TYPE",
  "INVALID_REQUEST",
  "INVALID_IMAGE",
  "NO_HAND_DETECTED",
  "IMAGE_FETCH_FAILED",
  "IMAGE_FETCH_TIMEOUT",
  "INFERENCE_ERROR",
] as const;

type AiApiErrorCode = (typeof AI_API_ERROR_CODES)[number];

function isAiApiErrorCode(value: string): value is AiApiErrorCode {
  return (AI_API_ERROR_CODES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseErrorSide(value: unknown): "left" | "right" | null {
  return value === "left" || value === "right" ? value : null;
}

/** AI APIの `{ error: { code, message, side? }, request_id? }` を読む。仕様外なら null。 */
export function parseAiApiErrorResponse(body: string) {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return null;
  }
  if (!isRecord(value) || !isRecord(value.error) || typeof value.error.code !== "string") {
    return null;
  }
  if (!isAiApiErrorCode(value.error.code)) return null;

  return {
    code: value.error.code,
    message: typeof value.error.message === "string" ? value.error.message : "",
    side: parseErrorSide(value.error.side),
    requestId: typeof value.request_id === "string" ? value.request_id : null,
  };
}

interface AnalysisErrorOptions {
  cause?: unknown;
  httpStatus?: number;
  apiResponseBody?: string;
  apiErrorSide?: "left" | "right" | null;
  apiRequestId?: string | null;
}

export class AnalysisExecutionError extends Error {
  readonly code: AnalysisErrorCode;
  readonly httpStatus: number | null;
  readonly apiResponseBody: string | null;
  readonly apiErrorSide: "left" | "right" | null;
  readonly apiRequestId: string | null;

  constructor(
    code: AnalysisErrorCode,
    message: string,
    options: AnalysisErrorOptions = {}
  ) {
    super(message, { cause: options.cause });
    this.name = "AnalysisExecutionError";
    this.code = code;
    this.httpStatus = options.httpStatus ?? null;
    this.apiResponseBody = options.apiResponseBody ?? null;
    this.apiErrorSide = options.apiErrorSide ?? null;
    this.apiRequestId = options.apiRequestId ?? null;
  }
}

export function normalizeAnalysisError(error: unknown): AnalysisExecutionError {
  if (error instanceof AnalysisExecutionError) return error;

  return new AnalysisExecutionError(
    "unknown",
    error instanceof Error ? error.message : "不明な解析エラーが発生しました",
    { cause: error }
  );
}

function errorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      error_name: error.name,
      error_message: error.message,
      error_stack: error.stack ?? null,
    };
  }

  return {
    error_name: "UnknownError",
    error_message: String(error),
    error_stack: null,
  };
}

export function createAnalysisFailureLog(
  screeningId: string,
  error: AnalysisExecutionError,
  occurredAt: string
) {
  return {
    event: "ai_analysis_failed",
    screening_id: screeningId,
    error_code: error.code,
    http_status: error.httpStatus,
    api_error_body: error.apiResponseBody,
    api_error_side: error.apiErrorSide,
    api_request_id: error.apiRequestId,
    occurred_at: occurredAt,
    ...errorDetails(error),
  };
}

export function createAnalysisFailureUpdate(
  error: AnalysisExecutionError,
  occurredAt: string
) {
  return {
    status: "failed" as const,
    analysis_error_code: error.code,
    analysis_error_http_status: error.httpStatus,
    analysis_error_at: occurredAt,
  };
}

export function logAnalysisFailure(
  screeningId: string,
  error: AnalysisExecutionError,
  occurredAt: string
) {
  console.error(
    JSON.stringify(createAnalysisFailureLog(screeningId, error, occurredAt))
  );
}

export function logAnalysisFailurePersistenceError(
  screeningId: string,
  error: unknown,
  occurredAt: string
) {
  console.error(
    JSON.stringify(
      createAnalysisFailurePersistenceLog(screeningId, error, occurredAt)
    )
  );
}

export function createAnalysisFailurePersistenceLog(
  screeningId: string,
  error: unknown,
  occurredAt: string
) {
  return {
    event: "ai_analysis_failure_persistence_failed",
    screening_id: screeningId,
    occurred_at: occurredAt,
    ...errorDetails(error),
  };
}
