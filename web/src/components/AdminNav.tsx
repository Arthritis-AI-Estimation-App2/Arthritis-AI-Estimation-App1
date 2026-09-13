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
    label: "医療機関の一覧",
  },
  {
    href: "/admin/screenings",
    label: "全撮影記録",
  },
] as const;

function isNavItemCurrent(pathname: string, href: string) {
  if (!isUnder(pathname, href)) return false;
  return !ADMIN_ACCOUNT_LINKS.some((link) => isUnder(pathname, link.href));
}

function navClassName(isCurrent: boolean) {
  return isCurrent
    ? "font-medium text-primary"
    : "text-secondary-foreground hover:text-foreground";
}

export default function AdminNav() {
  const pathname = usePathname();
  const isAccountCurrent = ADMIN_ACCOUNT_LINKS.some((link) =>
    isUnder(pathname, link.href)
  );

  return (
    <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      {NAV_ITEMS.map(({ href, label }) => {
        const isCurrent = isNavItemCurrent(pathname, href);

        return (
          <Link
            key={href}
            href={href}
            aria-current={isCurrent ? "page" : undefined}
            className={navClassName(isCurrent)}
          >
            {label}
          </Link>
        );
      })}
      <AdminAccountMenu isCurrent={isAccountCurrent} />
    </nav>
  );
}
