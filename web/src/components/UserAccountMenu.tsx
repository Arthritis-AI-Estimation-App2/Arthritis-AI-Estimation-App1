"use client";

import { logout } from "@/app/actions/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import Link from "@/components/ui/Link";
import { usePathname } from "next/navigation";
import { requestCaptureLeave } from "@/lib/capture-leave-request";

function isCurrentPasswordPage(pathname: string, passwordHref: string) {
  return pathname === passwordHref || pathname.startsWith(`${passwordHref}/`);
}

/** Logged-in user's menu, shared by clinic staff and administrators. */
export default function UserAccountMenu({
  displayName,
  passwordHref,
  roleLabel,
}: {
  displayName: string;
  passwordHref: string;
  roleLabel: string;
}) {
  const pathname = usePathname();
  const isCurrent = isCurrentPasswordPage(pathname, passwordHref);
  const isCapture = pathname.startsWith("/capture");

  const handleLogoutClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isCapture) return;

    const handled = requestCaptureLeave(() => {
      void logout();
    });
    if (handled) event.preventDefault();
  };

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={`${displayName}のアカウントメニュー`}
        aria-current={isCurrent ? "page" : undefined}
        className={`group inline-flex min-h-11 min-w-0 items-center gap-1 rounded-md px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
          isCurrent
            ? "font-medium text-primary"
            : "text-secondary-foreground hover:text-foreground"
        }`}
      >
        <span className="max-w-24 truncate sm:max-w-52">{displayName}</span>
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
        <div className="max-w-64 border-b border-border px-3 py-2">
          <p className="text-xs text-muted-foreground">{roleLabel}</p>
          <p className="break-words text-sm font-medium text-foreground">{displayName}</p>
        </div>
        <DropdownMenuLinkItem closeOnClick render={<Link href={passwordHref} />}>
          アカウント設定
        </DropdownMenuLinkItem>
        <form action={logout} className="mt-1 border-t border-border pt-1">
          <DropdownMenuItem
            nativeButton
            render={<button type="submit" />}
            onClick={handleLogoutClick}
          >
            ログアウト
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
