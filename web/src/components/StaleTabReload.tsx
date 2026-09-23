"use client";

import { useEffect } from "react";
import { createStaleTabRecovery, STALE_TAB_HEARTBEAT_MS } from "@/lib/stale-tab";

export default function StaleTabReload() {
  useEffect(() => {
    const recovery = createStaleTabRecovery({
      now: Date.now,
      isOnline: () => navigator.onLine,
      reload: () => window.location.reload(),
    });

    const onVisibility = () => {
      if (document.visibilityState === "hidden") recovery.noteHidden();
      else recovery.noteVisible();
    };
    const onPageHide = () => recovery.noteHidden();
    const onPageShow = () => recovery.noteVisible();
    const onOnline = () => {
      if (document.visibilityState === "visible") recovery.noteVisible();
    };
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === "visible") recovery.noteVisible();
    }, STALE_TAB_HEARTBEAT_MS);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return null;
}
