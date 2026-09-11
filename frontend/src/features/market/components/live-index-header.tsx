import { memo, useMemo } from 'react';
import { type IndexQuote, type MarketIndex, type MarketStatus } from '@/features/market/domain';
import { mergeUnderlyingLive } from '@/features/option-chain/domain';
import { useLiveIndexTick } from '@/stores/market-state.store';
import { IndexHeader } from './index-header';

interface LiveIndexHeaderProps {
  index: MarketIndex;
  status: MarketStatus;
  /** REST/snapshot seed; overridden by the stream when it is newer. */
  quote: IndexQuote | null;
  isLoading: boolean;
  active: 'chart' | 'option-chain';
}

/**
 * Isolates per-tick re-renders to the header: only this component subscribes
 * to the underlying's live tick, so the page hosting the grid stays still.
 */
export const LiveIndexHeader = memo(function LiveIndexHeader({
  index,
  status,
  quote,
  isLoading,
  active,
}: LiveIndexHeaderProps) {
  const tick = useLiveIndexTick(index.instrumentKey);
  const merged = useMemo(() => mergeUnderlyingLive(quote, tick), [quote, tick]);
  return (
    <IndexHeader
      index={index}
      status={status}
      quote={merged}
      isLoading={isLoading}
      active={active}
    />
  );
});
