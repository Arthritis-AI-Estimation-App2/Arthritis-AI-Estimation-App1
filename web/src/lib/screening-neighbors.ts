export type TimedScreening = {
  id: string;
  createdAt: string;
};

export type AdjacentScreening = TimedScreening & {
  subjectId: string | null;
};

/**
 * 撮影日時が同じときの並びは id の辞書順。
 * 正規の小文字UUIDでは、この順が PostgreSQL の uuid 比較と一致する。
 */
export function compareScreeningTime(a: TimedScreening, b: TimedScreening) {
  const time = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (time !== 0 && Number.isFinite(time)) return time;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/** 撮影日時の直前（前）と直後（次）を返す。 */
export function pickAdjacentScreenings<T extends TimedScreening>(
  current: TimedScreening,
  records: readonly T[]
): { previous: T | null; next: T | null } {
  let previous: T | null = null;
  let next: T | null = null;

  for (const record of records) {
    if (record.id === current.id) continue;
    const order = compareScreeningTime(record, current);
    if (order < 0 && (previous === null || compareScreeningTime(record, previous) > 0)) {
      previous = record;
    }
    if (order > 0 && (next === null || compareScreeningTime(record, next) < 0)) {
      next = record;
    }
  }

  return { previous, next };
}

function quotePostgrestValue(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

/** 現在の記録より前（古い、同時刻なら小さい id）の PostgREST or 条件。 */
export function olderScreeningOrFilter(id: string, createdAt: string) {
  const created = quotePostgrestValue(createdAt);
  const screeningId = quotePostgrestValue(id);
  return `created_at.lt.${created},and(created_at.eq.${created},id.lt.${screeningId})`;
}

/** 現在の記録より後（新しい、同時刻なら大きい id）の PostgREST or 条件。 */
export function newerScreeningOrFilter(id: string, createdAt: string) {
  const created = quotePostgrestValue(createdAt);
  const screeningId = quotePostgrestValue(id);
  return `created_at.gt.${created},and(created_at.eq.${created},id.gt.${screeningId})`;
}
