/** この時間より長く操作できない状態が続いたら、クライアントの状態を捨てて読み直す。 */
export const STALE_TAB_RELOAD_MS = 60 * 60 * 1000;

/** 表示中に最終時刻を残す間隔。非表示イベントが届かない凍結でも経過を測る。 */
export const STALE_TAB_HEARTBEAT_MS = 15 * 1000;

export function createStaleTabRecovery({
  now,
  reload,
  isOnline = () => true,
  thresholdMs = STALE_TAB_RELOAD_MS,
}: {
  now: () => number;
  reload: () => void;
  isOnline?: () => boolean;
  thresholdMs?: number;
}) {
  let lastSeen = now();
  let reloading = false;

  const noteHidden = () => {
    // すでに閾値を超えているとき、遅れて届いた非表示イベントで時刻を進めない。
    if (now() - lastSeen < thresholdMs) lastSeen = now();
  };

  const noteVisible = () => {
    if (reloading) return;
    if (now() - lastSeen < thresholdMs) {
      lastSeen = now();
      return;
    }
    // オフラインの再読み込みは、見えていた画面を通信エラーに置き換える。
    if (!isOnline()) return;
    reloading = true;
    reload();
  };

  return { noteHidden, noteVisible };
}
