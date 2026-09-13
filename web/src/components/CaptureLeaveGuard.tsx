"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import {
  CAPTURE_LEAVE_REQUEST_EVENT,
  type CaptureLeaveRequestDetail,
} from "@/lib/capture-leave-request";

const HISTORY_GUARD_KEY = "__arthritisCaptureLeaveGuard";

type PendingNavigation =
  | { kind: "back" }
  | { kind: "run"; run: () => void };

function historyStateWithGuard(state: unknown, guardId: string) {
  const current = state && typeof state === "object" ? state : {};
  return { ...current, [HISTORY_GUARD_KEY]: guardId };
}

function hasHistoryGuard(state: unknown, guardId: string) {
  return Boolean(
    state &&
      typeof state === "object" &&
      HISTORY_GUARD_KEY in state &&
      (state as Record<string, unknown>)[HISTORY_GUARD_KEY] === guardId
  );
}

function CaptureDiscardDialog({
  open,
  onContinue,
  onDiscard,
}: {
  open: boolean;
  onContinue: () => void;
  onDiscard: () => void;
}) {
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onContinue();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-40 min-h-dvh bg-foreground/40" />
        <AlertDialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-5 text-foreground shadow-xl">
          <AlertDialog.Title className="text-lg font-bold">
            撮影を中止しますか？
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm leading-relaxed text-secondary-foreground">
            撮影済みの画像はまだ保存されていません。移動すると破棄され、次回は左手からの撮影になります。
          </AlertDialog.Description>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={onContinue}>
              撮影を続ける
            </Button>
            <Button type="button" variant="danger" onClick={onDiscard}>
              破棄して移動
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export default function CaptureLeaveGuard({
  active,
  onDiscard,
}: {
  active: boolean;
  onDiscard: () => void;
}) {
  const router = useRouter();
  const guardId = useId();
  const [dialogOpen, setDialogOpen] = useState(false);
  const pendingNavigationRef = useRef<PendingNavigation | null>(null);
  const onDiscardRef = useRef(onDiscard);
  const bypassRef = useRef(false);
  const leavingRef = useRef(false);
  const restoringHistoryRef = useRef(false);
  const guardInstalledRef = useRef(false);

  useEffect(() => {
    onDiscardRef.current = onDiscard;
  }, [onDiscard]);

  useEffect(() => {
    if (active || !guardInstalledRef.current || leavingRef.current) return;

    guardInstalledRef.current = false;
    bypassRef.current = true;
    if (hasHistoryGuard(window.history.state, guardId)) {
      window.history.back();
    }
  }, [active, guardId]);

  useEffect(() => {
    if (!active) return;

    bypassRef.current = false;
    leavingRef.current = false;

    if (!hasHistoryGuard(window.history.state, guardId)) {
      window.history.pushState(
        historyStateWithGuard(window.history.state, guardId),
        "",
        window.location.href
      );
    }
    guardInstalledRef.current = true;

    const requestNavigation = (pending: PendingNavigation) => {
      pendingNavigationRef.current = pending;
      setDialogOpen(true);
    };

    const preventEvent = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const handleDocumentClick = (event: MouseEvent) => {
      if (bypassRef.current || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!(event.target instanceof Element)) return;

      const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
      if (anchor && !anchor.download && (!anchor.target || anchor.target === "_self")) {
        const destination = new URL(anchor.href, window.location.href);
        const current = new URL(window.location.href);
        if (
          destination.pathname === current.pathname &&
          destination.search === current.search &&
          destination.hash !== current.hash
        ) {
          return;
        }

        preventEvent(event);
        requestNavigation({
          kind: "run",
          run: () => {
            if (destination.origin === current.origin) {
              router.push(`${destination.pathname}${destination.search}${destination.hash}`);
            } else {
              window.location.assign(destination.href);
            }
          },
        });
        return;
      }
    };

    const handleRequestedNavigation = (event: Event) => {
      const request = event as CustomEvent<CaptureLeaveRequestDetail>;
      if (typeof request.detail?.run !== "function") return;
      event.preventDefault();
      requestNavigation({ kind: "run", run: request.detail.run });
    };

    const handleDocumentSubmit = (event: SubmitEvent) => {
      if (bypassRef.current || event.defaultPrevented) return;
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || (form.target && form.target !== "_self")) return;

      preventEvent(event);
      const submitter = event.submitter;
      requestNavigation({
        kind: "run",
        run: () => form.requestSubmit(submitter instanceof HTMLElement ? submitter : undefined),
      });
    };

    const handlePopState = (event: PopStateEvent) => {
      if (bypassRef.current) return;

      if (restoringHistoryRef.current && hasHistoryGuard(event.state, guardId)) {
        restoringHistoryRef.current = false;
        requestNavigation({ kind: "back" });
        return;
      }

      if (!hasHistoryGuard(event.state, guardId)) {
        restoringHistoryRef.current = true;
        window.history.forward();
      }
    };

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (bypassRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    document.addEventListener("click", handleDocumentClick, true);
    document.addEventListener("submit", handleDocumentSubmit, true);
    window.addEventListener(CAPTURE_LEAVE_REQUEST_EVENT, handleRequestedNavigation);
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
      document.removeEventListener("submit", handleDocumentSubmit, true);
      window.removeEventListener(CAPTURE_LEAVE_REQUEST_EVENT, handleRequestedNavigation);
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [active, guardId, router]);

  const continueCapture = () => {
    pendingNavigationRef.current = null;
    setDialogOpen(false);
  };

  const discardAndNavigate = () => {
    const pending = pendingNavigationRef.current;
    if (!pending) return;

    leavingRef.current = true;
    bypassRef.current = true;
    pendingNavigationRef.current = null;
    setDialogOpen(false);
    onDiscardRef.current();

    if (pending.kind === "back") {
      window.history.go(-2);
      return;
    }

    const runNavigation = pending.run;
    if (hasHistoryGuard(window.history.state, guardId)) {
      window.addEventListener("popstate", runNavigation, { once: true });
      window.history.back();
    } else {
      runNavigation();
    }
  };

  return (
    <CaptureDiscardDialog
      open={dialogOpen}
      onContinue={continueCapture}
      onDiscard={discardAndNavigate}
    />
  );
}
