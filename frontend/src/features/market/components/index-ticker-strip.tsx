import { Link } from 'react-router';
import { paths } from '@/app/router/paths';
import { ChangeValue } from '@/components/trading/change-value';
import { PriceLevel } from '@/components/trading/price-level';
import { marketCatalog } from '@/features/market/config';
import { type IndexQuote, type InstrumentKey } from '@/features/market/domain';
import { cn } from '@/lib/utils';
import { decimalsForTick } from '@/utils/format';

interface IndexTickerStripProps {
  quotes: ReadonlyMap<InstrumentKey, IndexQuote> | undefined;
  selectedIndexCode?: string | undefined;
  className?: string;
}

/** Static (non-scrolling) strip of all six indexes. Always visible; one glance. */
export function IndexTickerStrip({ quotes, selectedIndexCode, className }: IndexTickerStripProps) {
  return (
    <ul
      className={cn(
        'flex items-stretch divide-x divide-line overflow-x-auto border-b border-line bg-surface-sunken text-xs',
        className,
      )}
      aria-label="Index ticker"
    >
      {marketCatalog.indexes().map((index) => {
        const quote = quotes?.get(index.instrumentKey);
        const instrument = marketCatalog.instrumentByKey(index.instrumentKey);
        const decimals = decimalsForTick(instrument.tickSize);
        const selected = index.code === selectedIndexCode;
        return (
          <li key={index.code} className="shrink-0">
            <Link
              to={paths.marketIndex(marketCatalog.pathOf(index))}
              aria-current={selected ? 'page' : undefined}
              className={cn(
                'flex h-8 items-center gap-2 px-3 hover:bg-surface-raised/70',
                selected ? 'text-ink shadow-[inset_0_-2px_0_0_var(--accent)]' : 'text-ink-muted',
              )}
            >
              <span className="font-medium">{index.shortName}</span>
              {quote ? (
                <>
                  <PriceLevel value={quote.ltp} decimals={decimals} className="text-ink" />
                  <ChangeValue
                    change={quote.change}
                    changePercent={quote.changePercent}
                    percentOnly
                  />
                </>
              ) : (
                <span className="text-ink-faint">—</span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
