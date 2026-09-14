import type { ScreeningStatus } from "@/lib/types";
import { SCREENING_STATUS_LABELS } from "./screening-status.ts";

export const ADMIN_SCREENINGS_PAGE_SIZE = 20;

export const SCREENING_STATUS_OPTIONS: ReadonlyArray<{
  value: ScreeningStatus;
  label: string;
}> = [
  { value: "uploading", label: SCREENING_STATUS_LABELS.uploading },
  { value: "analyzing", label: SCREENING_STATUS_LABELS.analyzing },
  { value: "completed", label: SCREENING_STATUS_LABELS.completed },
  { value: "failed", label: SCREENING_STATUS_LABELS.failed },
];

export type AdminScreeningFilters = {
  clinicId: string;
  dateFrom: string;
  dateTo: string;
  status: ScreeningStatus | "";
  subjectId: string;
  screeningIdInput: string;
  screeningId: string;
  screeningIdPrefix: string;
  page: number;
};

type RawAdminScreeningFilters = {
  clinic?: string;
  from?: string;
  to?: string;
  status?: string;
  subject?: string;
  id?: string;
  page?: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCREENING_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_TEXT_TEMPLATE = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx";
export const MIN_SCREENING_ID_PREFIX_HEX = 8;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SCREENING_STATUSES = new Set<ScreeningStatus>(
  SCREENING_STATUS_OPTIONS.map(({ value }) => value)
);

function validDate(value: string | undefined) {
  if (!value || !DATE_PATTERN.test(value)) return "";
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? value
    : "";
}

function screeningIdPrefix(value: string) {
  const lower = value.toLowerCase();
  if (lower.length === 0 || lower.length > UUID_TEXT_TEMPLATE.length) return "";
  for (let index = 0; index < lower.length; index += 1) {
    const expected = UUID_TEXT_TEMPLATE[index];
    const actual = lower[index];
    if (expected === "-") {
      if (actual !== "-") return "";
      continue;
    }
    if (!/[0-9a-f]/.test(actual)) return "";
  }
  const hexCount = lower.replaceAll("-", "").length;
  return hexCount >= MIN_SCREENING_ID_PREFIX_HEX ? lower : "";
}

/** 撮影IDの先頭一致を、UUIDの大小比較で表す。 */
export function screeningIdPrefixBounds(prefix: string) {
  let from = "";
  let to = "";
  for (let index = 0; index < UUID_TEXT_TEMPLATE.length; index += 1) {
    const expected = UUID_TEXT_TEMPLATE[index];
    if (index < prefix.length) {
      from += prefix[index];
      to += prefix[index];
      continue;
    }
    if (expected === "-") {
      from += "-";
      to += "-";
      continue;
    }
    from += "0";
    to += "f";
  }
  return { from, to };
}

/** 一覧・口頭伝達用の撮影ID。検索と同じ先頭8文字。 */
export function formatScreeningId(id: string) {
  return id.slice(0, MIN_SCREENING_ID_PREFIX_HEX);
}

/** 詳細画面用の撮影ID。URL・CSVと同じフルUUID。 */
export function formatFullScreeningId(id: string) {
  return id;
}

export function normalizeAdminScreeningFilters(
  raw: RawAdminScreeningFilters
): AdminScreeningFilters {
  const status = SCREENING_STATUSES.has(raw.status as ScreeningStatus)
    ? (raw.status as ScreeningStatus)
    : "";
  const parsedPage = Number.parseInt(raw.page ?? "", 10);

  const screeningIdInput = (raw.id ?? "").trim().slice(0, 100);
  const screeningId = SCREENING_ID_PATTERN.test(screeningIdInput)
    ? screeningIdInput.toLowerCase()
    : "";

  return {
    clinicId: raw.clinic && UUID_PATTERN.test(raw.clinic) ? raw.clinic : "",
    dateFrom: validDate(raw.from),
    dateTo: validDate(raw.to),
    status,
    subjectId: (raw.subject ?? "").trim().slice(0, 100),
    screeningIdInput,
    screeningId,
    screeningIdPrefix: screeningId ? "" : screeningIdPrefix(screeningIdInput),
    page: Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
  };
}

/** HTMLの日付を日本時間の開始時刻に変換する。 */
export function startOfJapanDate(date: string) {
  return new Date(`${date}T00:00:00+09:00`).toISOString();
}

/** 指定した日本時間の日付の翌日0時（検索上限・非包含）を返す。 */
export function endOfJapanDateExclusive(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  const nextDate = [
    nextDay.getUTCFullYear(),
    String(nextDay.getUTCMonth() + 1).padStart(2, "0"),
    String(nextDay.getUTCDate()).padStart(2, "0"),
  ].join("-");
  return startOfJapanDate(nextDate);
}

export function adminScreeningListHref(
  filters: AdminScreeningFilters,
  page: number
) {
  const params = new URLSearchParams();
  if (filters.clinicId) params.set("clinic", filters.clinicId);
  if (filters.dateFrom) params.set("from", filters.dateFrom);
  if (filters.dateTo) params.set("to", filters.dateTo);
  if (filters.status) params.set("status", filters.status);
  if (filters.subjectId) params.set("subject", filters.subjectId);
  if (filters.screeningIdInput) params.set("id", filters.screeningIdInput);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/screenings?${query}` : "/admin/screenings";
}

export function adminScreeningExportHref(filters: AdminScreeningFilters) {
  const listHref = adminScreeningListHref(filters, 1);
  const query = listHref.split("?", 2)[1];
  return query
    ? `/admin/screenings/export?${query}`
    : "/admin/screenings/export";
}

/** 割り当て済みは被験者の所属、未割り当ては作成スタッフの所属で医療機関に紐づける。 */
export function clinicScreeningOrFilter(subjectIds: string[], staffIds: string[]) {
  const conditions: string[] = [];
  if (subjectIds.length > 0) {
    conditions.push(`subject_id.in.(${subjectIds.join(",")})`);
  }
  if (staffIds.length > 0) {
    conditions.push(`and(subject_id.is.null,created_by.in.(${staffIds.join(",")}))`);
  }
  return conditions.join(",");
}
