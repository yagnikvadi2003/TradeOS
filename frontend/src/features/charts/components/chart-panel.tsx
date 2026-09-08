import { lazy, Suspense } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CANDLE_INTERVALS, type CandleInterval } from '@/features/charts/domain';
import { useCandles } from '@/features/charts/hooks/use-candles';
import { marketCatalog } from '@/features/market/config';
import { type MarketIndex } from '@/features/market/domain';
import { strings } from '@/lib/strings';
import { cn } from '@/lib/utils';
import { useMarketUiStore } from '@/stores/market-ui.store';
import { decimalsForTick } from '@/utils/format';

const PriceChart = lazy(() =>
  import('./price-chart').then((module) => ({ default: module.PriceChart })),
);

interface ChartPanelProps {
  index: MarketIndex;
  className?: string;
}

/**
 * Chart region with interval selection and full loading/empty/error states.
 * The charting library is code-split so the overview page never pays for it.
 */
export function ChartPanel({ index, className }: ChartPanelProps) {
  const interval = useMarketUiStore((s) => s.chartInterval);
  const setInterval = useMarketUiStore((s) => s.setChartInterval);
  const query = useCandles(index.instrumentKey, interval);
  const instrument = marketCatalog.instrumentByKey(index.instrumentKey);
  const decimals = decimalsForTick(instrument.tickSize);

  return (
    <section
      aria-labelledby="chart-heading"
      className={cn('flex min-h-0 flex-1 flex-col', className)}
      data-testid="chart-panel"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-1.5 sm:px-5">
        <h2 id="chart-heading" className="text-xs font-medium text-ink-muted">
          {strings.chart.title}
        </h2>
        <div
          role="radiogroup"
          aria-label={strings.chart.interval}
          className="flex items-center gap-0.5"
        >
          {CANDLE_INTERVALS.map((candidate: CandleInterval) => {
            const selected = candidate === interval;
            return (
              <Button
                key={candidate}
                role="radio"
                aria-checked={selected}
                size="xs"
                variant="ghost"
                className={cn(selected && 'bg-surface-raised text-ink')}
                onClick={() => setInterval(candidate)}
              >
                {strings.chart.intervals[candidate]}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="relative min-h-[18rem] flex-1 sm:min-h-[22rem]">
        {query.isPending ? (
          <ChartSkeleton />
        ) : query.isError ? (
          <ErrorState
            title={strings.chart.error}
            body={strings.chart.errorBody}
            detail={query.error.message}
            onRetry={() => void query.refetch()}
            className="m-4"
          />
        ) : query.data.candles.length === 0 ? (
          <EmptyState title={strings.chart.empty} body={strings.chart.emptyBody} className="m-4" />
        ) : (
          <Suspense fallback={<ChartSkeleton />}>
            <PriceChart
              candles={query.data.candles}
              decimals={decimals}
              ariaLabel={strings.chart.ariaLabel(index.name)}
              className="absolute inset-0"
            />
          </Suspense>
        )}
      </div>
    </section>
  );
}

function ChartSkeleton() {
  return (
    <div
      className="absolute inset-0 flex flex-col gap-2 p-4"
      aria-busy="true"
      aria-label={strings.chart.loading}
    >
      <Skeleton className="h-full w-full" />
      <Skeleton className="h-3 w-1/3" />
    </div>
  );
}
