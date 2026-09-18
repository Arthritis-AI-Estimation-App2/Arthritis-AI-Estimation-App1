"use client";

import PatientBottomNav from "@/components/PatientBottomNav";
import UserAccountMenu from "@/components/UserAccountMenu";
import Link from "@/components/ui/Link";
import { usePathname } from "next/navigation";

export default function ClinicStaffChrome({
  userName,
  clinicName,
  children,
}: {
  userName: string;
  clinicName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isCapture = pathname.startsWith("/capture");

  return (
    <div
      className={
        isCapture
          ? "flex h-dvh flex-col overflow-hidden bg-background"
          : "min-h-dvh bg-background pb-nav-safe"
      }
    >
      <header
        className={`z-10 border-b border-border bg-surface pt-safe ${
          isCapture ? "shrink-0" : "sticky top-0"
        }`}
      >
        <div
          className={`mx-auto grid max-w-4xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-safe-4 ${
            isCapture ? "py-1" : "py-1.5"
          }`}
        >
          <Link
            href="/"
            className="flex min-h-11 min-w-0 flex-col justify-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <span className="truncate text-sm font-bold leading-5 text-primary sm:text-base">
              関節炎スクリーニング
            </span>
            {!isCapture && (
              <span className="truncate text-xs leading-4 text-muted-foreground" title={clinicName}>
                {clinicName}
              </span>
            )}
          </Link>
          <UserAccountMenu
            displayName={userName}
            roleLabel={clinicName}
            passwordHref="/account/password"
          />
        </div>
      </header>
      <main
        className={
          isCapture
            ? "mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col overflow-y-auto px-safe-4 py-3"
            : "mx-auto max-w-4xl px-safe-4 py-6"
        }
      >
        {children}
      </main>
      {!isCapture && <PatientBottomNav />}
    </div>
  );
}
