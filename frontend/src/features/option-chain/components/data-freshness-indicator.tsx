import { useEffect, useState } from 'react';
import { StatusDot, type StatusTone } from '@/components/trading/status-dot';
import { classifyFreshness, type Freshness } from '@/features/option-chain/domain';
import { strings } from '@/lib/strings';
import { useMarketStateStore } from '@/stores/market-state.store';
import { cn } from '@/lib/utils';
import { formatIstTime } from '@/utils/format';

const tone: Record<Freshness, StatusTone> = { fresh: 'up', aging: 'warn', stale: 'down' };

interface DataFreshnessIndicatorProps {
  /** Epoch ms of the oldest contract update in the current REST snapshot. */
  oldestUpdateAt: number;
  /** Injected clock for tests. */
  now?: () => number;
  className?: string;
}

/**
 * Age of the data on screen. A one-second tick refreshes the label only — it
 * never triggers a fetch. Age is derived from a ticking clock rather than
 * stored, so a new snapshot re-renders with the correct age immediately.
 */
export function DataFreshnessIndicator({
  oldestUpdateAt,
  now = () => Date.now(),
  className,
}: DataFreshnessIndicatorProps) {
  const [tick, setTick] = useState(() => now());
  useEffect(() => {
    const id = setInterval(() => setTick(now()), 1_000);
    return () => clearInterval(id);
  }, [now]);
  // The stream's newest applied update wins over the snapshot age; this is the
  // only component that re-renders on that value.
  const liveAt = useMarketStateStore((s) => s.lastUpdateAt);
  const asOf = liveAt !== null && liveAt > oldestUpdateAt ? liveAt : oldestUpdateAt;
  const ageMs = Math.max(0, Math.max(tick, now()) - asOf);
  const freshness = classifyFreshness(ageMs);
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-xs', className)}
      title={`${strings.optionChain.freshness.hint} ${formatIstTime(asOf)} IST`}
      data-freshness={freshness}
      data-testid="data-freshness"
    >
      <span className="text-ink-faint">{strings.optionChain.freshness.label}</span>
      <StatusDot tone={tone[freshness]} />
      <span className="text-ink-muted">{strings.optionChain.freshness[freshness]}</span>
      <span className="tnum text-ink-faint">
        {strings.optionChain.freshness.age(Math.floor(ageMs / 1_000))}
      </span>
    </span>
  );
}
