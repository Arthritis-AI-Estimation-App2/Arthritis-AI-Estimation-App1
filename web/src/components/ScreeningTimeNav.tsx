import { formatJapanDateTime, JAPAN_TIME_ZONE } from "@/lib/japan-date-time";
import type { AdjacentScreening } from "@/lib/screening-neighbors";
import Link from "@/components/ui/Link";

const segmentClassName =
  "whitespace-nowrap px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus";

function destinationLabel(screening: AdjacentScreening) {
  const subject = screening.subjectId ? `被験者ID ${screening.subjectId}` : "未割り当て";
  return `${formatJapanDateTime(screening.createdAt)}、${subject}`;
}

function japanYear(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: JAPAN_TIME_ZONE,
    year: "numeric",
  }).format(new Date(value));
}

/** ボタンに収まる撮影日時。年が違うときだけ年を付ける。 */
function formatNavTime(value: string, withYear: boolean) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: JAPAN_TIME_ZONE,
    ...(withYear ? { year: "numeric" as const } : {}),
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function NeighborSegment({
  screening,
  href,
  direction,
  withYear,
}: {
  screening: AdjacentScreening | null;
  href: string;
  direction: "previous" | "next";
  withYear: boolean;
}) {
  const isPrevious = direction === "previous";
  const label = isPrevious ? "← 前の記録" : "次の記録 →";

  if (!screening) {
    return (
      <span
        className={`${segmentClassName} bg-surface-muted text-subtle-foreground`}
        title={isPrevious ? "最も古い記録です" : "最も新しい記録です"}
      >
        {label}
      </span>
    );
  }

  const time = formatNavTime(screening.createdAt, withYear);
  const timeClassName = "text-xs font-normal text-muted-foreground";

  return (
    <Link
      href={href}
      aria-label={`${isPrevious ? "前の記録" : "次の記録"}、${destinationLabel(screening)}`}
      title={destinationLabel(screening)}
      className={`${segmentClassName} text-secondary-foreground hover:bg-surface-hover`}
    >
      <span className="inline-flex items-baseline gap-1.5">
        {isPrevious ? (
          <>
            <span>{label}</span>
            <span className={timeClassName}>{time}</span>
          </>
        ) : (
          <>
            <span className={timeClassName}>{time}</span>
            <span>{label}</span>
          </>
        )}
      </span>
    </Link>
  );
}

/** 戻るリンクの向かいに置く、撮影日時の前後への移動。 */
export default function ScreeningTimeNav({
  previous,
  next,
  hrefPrefix,
  className = "",
}: {
  previous: AdjacentScreening | null;
  next: AdjacentScreening | null;
  hrefPrefix: string;
  className?: string;
}) {
  if (!previous && !next) return null;

  const withYear =
    !previous ||
    !next ||
    japanYear(previous.createdAt) !== japanYear(next.createdAt);

  return (
    <nav
      aria-label="撮影日時の順"
      className={`inline-flex overflow-hidden rounded-lg border border-border-strong bg-surface ${className}`}
    >
      <NeighborSegment
        screening={previous}
        href={previous ? `${hrefPrefix}/${previous.id}` : ""}
        direction="previous"
        withYear={withYear}
      />
      <span aria-hidden="true" className="w-px self-stretch bg-border-strong" />
      <NeighborSegment
        screening={next}
        href={next ? `${hrefPrefix}/${next.id}` : ""}
        direction="next"
        withYear={withYear}
      />
    </nav>
  );
}
