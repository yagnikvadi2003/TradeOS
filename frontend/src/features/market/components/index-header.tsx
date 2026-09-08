import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { paths } from '@/app/router/paths';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChangeValue } from '@/components/trading/change-value';
import { MarketStatusBadge } from '@/components/trading/market-status-badge';
import { PriceLevel } from '@/components/trading/price-level';
import { QuoteSourceBadge } from '@/components/trading/quote-source-badge';
import { marketCatalog } from '@/features/market/config';
import { type IndexQuote, type MarketIndex, type MarketStatus } from '@/features/market/domain';
import { strings } from '@/lib/strings';
import { decimalsForTick, formatIstTime, formatLevel } from '@/utils/format';
import { CapabilityActions } from './capability-actions';

interface IndexHeaderProps {
  index: MarketIndex;
  status: MarketStatus;
  quote: IndexQuote | null;
  isLoading: boolean;
  active: 'chart' | 'option-chain';
}

/**
 * The one place the design spends its boldness: a large tabular level with
 * change, flanked by the breadcrumb and session state. Everything else on
 * the screen is quieter than this block.
 */
export function IndexHeader({ index, status, quote, isLoading, active }: IndexHeaderProps) {
  const exchange = marketCatalog.exchangeByCode(index.exchangeCode);
  const category = marketCatalog.categoryByCode(index.categoryCode);
  const instrument = marketCatalog.instrumentByKey(index.instrumentKey);
  const decimals = decimalsForTick(instrument.tickSize);
  const { previous, next } = marketCatalog.neighbours(index);

  return (
    <header className="border-b border-line bg-surface px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-2xs text-ink-faint">
            <Link to={paths.markets} className="hover:text-ink">
              {strings.nav.markets}
            </Link>
            <span aria-hidden="true">/</span>
            <span title={exchange.fullName}>{exchange.name}</span>
            <span aria-hidden="true">/</span>
            <span title={category.description}>{category.name}</span>
          </nav>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-ink">{index.name}</h1>
            <span className="text-xs text-ink-faint">{instrument.name}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {isLoading && !quote ? (
              <>
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-5 w-28" />
              </>
            ) : quote ? (
              <>
                <PriceLevel
                  value={quote.ltp}
                  decimals={decimals}
                  className="text-3xl font-semibold leading-none tracking-tight text-ink"
                />
                <ChangeValue
                  change={quote.change}
                  changePercent={quote.changePercent}
                  decimals={decimals}
                  className="text-base font-medium"
                />
                <QuoteSourceBadge source={quote.source} />
              </>
            ) : (
              <span className="text-lg text-ink-faint">{strings.market.noQuote}</span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          <div className="flex items-center gap-3">
            <MarketStatusBadge status={status} withNext />
            {quote ? (
              <span className="tnum text-xs text-ink-faint">
                {strings.market.lastUpdate} {formatIstTime(quote.updatedAt)}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5">
            <CapabilityActions index={index} active={active} />
            <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
            <Button
              asChild={previous !== null}
              variant="ghost"
              size="icon-sm"
              disabled={previous === null}
              aria-label={strings.market.previousIndex}
              title={previous ? previous.name : undefined}
            >
              {previous ? (
                <Link to={paths.marketIndex(marketCatalog.pathOf(previous))}>
                  <ChevronLeft />
                </Link>
              ) : (
                <ChevronLeft />
              )}
            </Button>
            <Button
              asChild={next !== null}
              variant="ghost"
              size="icon-sm"
              disabled={next === null}
              aria-label={strings.market.nextIndex}
              title={next ? next.name : undefined}
            >
              {next ? (
                <Link to={paths.marketIndex(marketCatalog.pathOf(next))}>
                  <ChevronRight />
                </Link>
              ) : (
                <ChevronRight />
              )}
            </Button>
          </div>
        </div>
      </div>

      {quote ? (
        <dl className="tnum mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
          <Stat label={strings.market.open} value={formatLevel(quote.open, decimals)} />
          <Stat label={strings.market.high} value={formatLevel(quote.high, decimals)} />
          <Stat label={strings.market.low} value={formatLevel(quote.low, decimals)} />
          <Stat
            label={strings.market.previousClose}
            value={formatLevel(quote.previousClose, decimals)}
          />
        </dl>
      ) : null}
    </header>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="text-ink-muted">{value}</dd>
    </div>
  );
}
