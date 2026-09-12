"use client";

import { logout } from "@/app/actions/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import Link from "next/link";
import { usePathname } from "next/navigation";

function isCurrentPasswordPage(pathname: string, passwordHref: string) {
  return pathname === passwordHref || pathname.startsWith(`${passwordHref}/`);
}

/** Logged-in user's menu, shared by clinic staff and administrators. */
export default function UserAccountMenu({
  displayName,
  passwordHref,
}: {
  displayName: string;
  passwordHref: string;
}) {
  const pathname = usePathname();
  const isCurrent = isCurrentPasswordPage(pathname, passwordHref);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-current={isCurrent ? "page" : undefined}
        className={`group inline-flex min-w-0 items-center gap-1 rounded-sm text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
          isCurrent
            ? "font-medium text-primary"
            : "text-secondary-foreground hover:text-foreground"
        }`}
      >
        <span className="max-w-52 truncate">{displayName} 様</span>
        <svg
          aria-hidden="true"
          className="h-4 w-4 shrink-0 transition-transform group-data-[popup-open]:rotate-180"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLinkItem closeOnClick render={<Link href={passwordHref} />}>
          アカウント設定
        </DropdownMenuLinkItem>
        <form action={logout}>
          <DropdownMenuItem nativeButton render={<button type="submit" />}>
            ログアウト
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
