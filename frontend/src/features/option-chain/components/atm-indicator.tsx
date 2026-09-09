import { ChangeValue } from '@/components/trading/change-value';
import { PriceLevel } from '@/components/trading/price-level';
import { type OptionChainSnapshot } from '@/features/option-chain/domain';
import { strings } from '@/lib/strings';
import { cn } from '@/lib/utils';
import { formatLevel } from '@/utils/format';

interface AtmIndicatorProps {
  snapshot: OptionChainSnapshot;
  decimals: number;
  className?: string;
}

/**
 * ATM reference block: spot with change, the resolved ATM strike, and the
 * chain-level put/call ratio. Reads only the snapshot header — never a row.
 */
export function AtmIndicator({ snapshot, decimals, className }: AtmIndicatorProps) {
  const { underlying, atmStrike, totals, lotSize, strikeStep } = snapshot;
  const distance = underlying.ltp - atmStrike;
  return (
    <dl
      className={cn('tnum flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs', className)}
      data-testid="atm-indicator"
    >
      <div className="flex items-baseline gap-1.5">
        <dt className="text-ink-faint">{strings.optionChain.spot}</dt>
        <dd className="flex items-baseline gap-1.5">
          <PriceLevel value={underlying.ltp} decimals={decimals} className="font-medium text-ink" />
          <ChangeValue
            change={underlying.change}
            changePercent={underlying.changePercent}
            decimals={decimals}
          />
        </dd>
      </div>
      <div className="flex items-baseline gap-1.5">
        <dt className="text-ink-faint">{strings.optionChain.atm}</dt>
        <dd className="text-accent font-medium" data-testid="atm-strike">
          {formatLevel(atmStrike, 0)}
        </dd>
        <dd className="text-ink-faint">
          ({distance >= 0 ? '+' : '−'}
          {formatLevel(Math.abs(distance), decimals)})
        </dd>
      </div>
      <div className="flex items-baseline gap-1.5">
        <dt className="text-ink-faint">{strings.optionChain.pcr}</dt>
        <dd className="text-ink-muted">
          {totals.putCallRatio === null ? '—' : totals.putCallRatio.toFixed(2)}
        </dd>
      </div>
      <div className="hidden items-baseline gap-1.5 sm:flex">
        <dt className="text-ink-faint">{strings.optionChain.lot}</dt>
        <dd className="text-ink-muted">{lotSize}</dd>
        <dt className="ml-2 text-ink-faint">{strings.optionChain.step}</dt>
        <dd className="text-ink-muted">{formatLevel(strikeStep, 0)}</dd>
      </div>
    </dl>
  );
}
