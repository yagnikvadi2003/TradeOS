import { useEffect, useMemo } from 'react';
import { useMarketStream } from '@/app/providers/use-market-stream';
import { type StreamKey } from '@/services/websocket/market-stream.messages';

/**
 * Retain live subscriptions for the lifetime of a component. Keys are
 * compared by content so a re-render with the same set does nothing; a
 * changed set releases the old keys and retains the new ones (the stream
 * refcounts, so overlapping keys never flap upstream).
 */
export function useLiveSubscription(keys: readonly StreamKey[], enabled = true): void {
  const stream = useMarketStream();
  const signature = keys.join('\u0000');
  const stable = useMemo(() => signature.split('\u0000').filter(Boolean), [signature]);
  useEffect(() => {
    if (!enabled || stable.length === 0) return;
    return stream.subscribe(stable);
  }, [stream, stable, enabled]);
}
