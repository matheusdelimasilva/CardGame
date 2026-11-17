import { useEffect, useState } from "react";

/**
 * Whole seconds left on a server countdown, ticking locally between
 * updates. The server sends a new object with every view, and each one
 * restarts the count from its `remainingMs`. null when nothing is counting.
 */
export function useSecondsLeft(
  timer: { remainingMs: number } | null,
): number | null {
  const [countdown, setCountdown] = useState<{
    timer: typeof timer;
    left: number;
  } | null>(null);
  useEffect(() => {
    if (!timer) return;
    const end = performance.now() + timer.remainingMs;
    const tick = () =>
      setCountdown({
        timer,
        left: Math.max(0, Math.ceil((end - performance.now()) / 1000)),
      });
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [timer]);
  return timer
    ? countdown?.timer === timer
      ? countdown.left
      : Math.max(0, Math.ceil(timer.remainingMs / 1000))
    : null;
}
