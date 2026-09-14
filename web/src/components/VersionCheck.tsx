"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { createVersionChecker, isVersionReloadSafePath } from "@/lib/app-version";

export default function VersionCheck() {
  const pathname = usePathname();
  const dirty = useRef(false);
  const check = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    let disposed = false;
    const checker = createVersionChecker({
      initialVersion: process.env.NEXT_PUBLIC_APP_BUILD_VERSION ?? "",
      now: Date.now,
      isSafe: () => !disposed && !dirty.current &&
        document.visibilityState === "visible" &&
        isVersionReloadSafePath(window.location.pathname),
      fetchVersion: async () => {
        // Plain fetch deliberately omits deployment-pinning headers/parameters.
        const response = await fetch("/api/version", {
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) return null;
        const body: unknown = await response.json();
        return body && typeof body === "object" && "version" in body
          ? body.version : null;
      },
      reload: () => window.location.reload(),
    });
    check.current = checker;
    const onVisibility = () => { void checker(); };
    const onInput = () => { dirty.current = true; };
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onInput, true);
    return () => {
      disposed = true;
      check.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onInput, true);
    };
  }, []);

  useEffect(() => {
    dirty.current = false;
    void check.current?.();
  }, [pathname]);

  return null;
}
