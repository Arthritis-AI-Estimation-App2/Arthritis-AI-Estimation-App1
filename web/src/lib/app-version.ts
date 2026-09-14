export const VERSION_CHECK_INTERVAL_MS = 60 * 60 * 1000;

// Only read-only screens. New routes must be reviewed before adding them here.
export function isVersionReloadSafePath(pathname: string) {
  return ["/", "/subjects", "/screenings", "/admin/screenings"].includes(pathname);
}

export function createVersionChecker({
  initialVersion,
  now,
  isSafe,
  fetchVersion,
  reload,
}: {
  initialVersion: string;
  now: () => number;
  isSafe: () => boolean;
  fetchVersion: () => Promise<unknown>;
  reload: () => void;
}) {
  let lastCheck = now();
  let pending = false;
  let updateAvailable = false;

  return async function check() {
    if (!initialVersion || pending || !isSafe()) return;
    if (updateAvailable) {
      reload();
      return;
    }
    if (now() - lastCheck < VERSION_CHECK_INTERVAL_MS) return;

    pending = true;
    lastCheck = now();
    try {
      const version = await fetchVersion();
      updateAvailable = typeof version === "string" && version.length > 0 &&
        version !== initialVersion;
      // Navigation, tab visibility and user input may change during the request.
      if (updateAvailable && isSafe()) reload();
    } catch {
      // Offline or failed checks must not interrupt the current workflow.
    } finally {
      pending = false;
    }
  };
}
