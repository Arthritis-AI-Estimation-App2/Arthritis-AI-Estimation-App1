"use client";

import PatientBottomNav from "@/components/PatientBottomNav";
import UserAccountMenu from "@/components/UserAccountMenu";
import Link from "next/link";
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
            isCapture ? "py-2" : "py-3"
          }`}
        >
          <div className="min-w-0">
            <Link href="/" className="flex min-h-11 items-center font-bold text-primary">
              <span className="truncate">関節炎スクリーニング</span>
            </Link>
            {!isCapture && (
              <p className="truncate text-xs text-muted-foreground" title={clinicName}>
                {clinicName}
              </p>
            )}
          </div>
          <UserAccountMenu
            displayName={userName}
            roleLabel={`医療機関スタッフ · ${clinicName}`}
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
