import { useEffect, useState } from 'react';

/**
 * Wall-clock in epoch ms, updated once per second. Only the clock component
 * subscribes, so the rest of the tree does not re-render each second.
 */
export function useIstClock(intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
