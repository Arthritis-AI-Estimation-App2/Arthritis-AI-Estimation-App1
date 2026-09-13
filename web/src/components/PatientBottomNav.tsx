"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "ホーム", matches: (pathname: string) => pathname === "/" },
  {
    href: "/capture",
    label: "撮影する",
    matches: (pathname: string) =>
      pathname.startsWith("/capture") || pathname.startsWith("/results"),
  },
  {
    href: "/grouping",
    label: "ID紐付け",
    matches: (pathname: string) => pathname.startsWith("/grouping"),
  },
  {
    href: "/subjects",
    label: "被験者ID一覧",
    matches: (pathname: string) => pathname.startsWith("/subjects"),
  },
];

export default function PatientBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="メインナビゲーション"
      className="fixed bottom-0 left-0 right-0 border-t border-border bg-surface pb-safe"
    >
      <div className="mx-auto flex max-w-4xl pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]">
        {NAV_ITEMS.map(({ href, label, matches }) => {
          const isCurrent = matches(pathname);

          return (
            <Link
              key={href}
              href={href}
              aria-current={isCurrent ? "page" : undefined}
              className={`flex-1 py-3 text-center text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus ${
                isCurrent
                  ? "bg-primary-subtle font-semibold text-primary"
                  : "text-secondary-foreground hover:bg-surface-hover"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
