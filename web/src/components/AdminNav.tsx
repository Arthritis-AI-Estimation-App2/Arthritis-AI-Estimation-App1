"use client";

import AdminAccountMenu, { ADMIN_ACCOUNT_LINKS } from "@/components/AdminAccountMenu";
import Link from "next/link";
import { usePathname } from "next/navigation";

function isUnder(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

const NAV_ITEMS = [
  {
    href: "/admin/clinics",
    label: "医療機関",
  },
  {
    href: "/admin/screenings",
    label: "撮影記録",
  },
] as const;

function isNavItemCurrent(pathname: string, href: string) {
  if (!isUnder(pathname, href)) return false;
  return !ADMIN_ACCOUNT_LINKS.some((link) => isUnder(pathname, link.href));
}

function navClassName(isCurrent: boolean) {
  return isCurrent
    ? "bg-primary-subtle font-semibold text-primary"
    : "text-secondary-foreground hover:bg-surface-hover hover:text-foreground";
}

export default function AdminNav() {
  const pathname = usePathname();
  const isAccountCurrent = ADMIN_ACCOUNT_LINKS.some((link) =>
    isUnder(pathname, link.href)
  );

  return (
    <nav aria-label="管理メニュー" className="flex items-center gap-1 text-xs sm:text-sm">
      {NAV_ITEMS.map(({ href, label }) => {
        const isCurrent = isNavItemCurrent(pathname, href);

        return (
          <Link
            key={href}
            href={href}
            aria-current={isCurrent ? "page" : undefined}
            className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-2 sm:px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${navClassName(isCurrent)}`}
          >
            {label}
          </Link>
        );
      })}
      <AdminAccountMenu isCurrent={isAccountCurrent} />
    </nav>
  );
}
