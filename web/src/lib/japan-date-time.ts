export const JAPAN_TIME_ZONE = "Asia/Tokyo";

type DateTimeValue = string | Date;

function validDate(value: DateTimeValue) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function format(
  value: DateTimeValue,
  options: Intl.DateTimeFormatOptions
) {
  const date = validDate(value);
  if (!date) return "";

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: JAPAN_TIME_ZONE,
    ...options,
  }).format(date);
}

export function formatJapanDateTime(value: DateTimeValue) {
  return format(value, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatJapanDate(value: DateTimeValue) {
  return format(value, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatJapanDateWithWeekday(value: DateTimeValue) {
  return format(value, {
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}

export function formatJapanTime(value: DateTimeValue, includeSeconds = false) {
  return format(value, {
    hour: "2-digit",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" as const } : {}),
  });
}

export function japanCalendarDayKey(value: DateTimeValue) {
  const date = validDate(value);
  if (!date) return "";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: JAPAN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}
