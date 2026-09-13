"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLinkItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";

export const ADMIN_ACCOUNT_LINKS = [
  { href: "/admin/staffs", label: "スタッフ" },
  { href: "/admin/admins", label: "管理者" },
] as const;

export default function AdminAccountMenu({ isCurrent = false }: { isCurrent?: boolean }) {
  const pathname = usePathname();

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-current={isCurrent ? "page" : undefined}
        className={`group flex min-h-11 items-center gap-1 whitespace-nowrap rounded-md px-2 sm:px-3 outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
          isCurrent ? "bg-primary-subtle font-semibold text-primary" : "text-secondary-foreground hover:bg-surface-hover hover:text-foreground"
        }`}
      >
        ユーザー管理
        <svg
          aria-hidden="true"
          className="h-4 w-4 transition-transform group-data-[popup-open]:rotate-180"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {ADMIN_ACCOUNT_LINKS.map(({ href, label }) => (
          <DropdownMenuLinkItem
            key={href}
            closeOnClick
            aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined}
            className={pathname === href || pathname.startsWith(`${href}/`) ? "bg-primary-subtle font-semibold text-primary" : ""}
            render={<Link href={href} />}
          >
            {label}
          </DropdownMenuLinkItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
