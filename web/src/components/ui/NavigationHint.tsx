import type { ReactNode } from "react";

/** 行全体がリンクになっている一覧で、遷移先を控えめに示すラベル。 */
export default function NavigationHint({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-muted-foreground">
      {children}
      <svg
        aria-hidden="true"
        className="h-3.5 w-3.5"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m6 4 4 4-4 4" />
      </svg>
    </span>
  );
}
