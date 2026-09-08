import { Link } from 'react-router';
import { paths } from '@/app/router/paths';
import { Skeleton } from '@/components/ui/skeleton';
import { ChangeValue } from '@/components/trading/change-value';
import { PriceLevel } from '@/components/trading/price-level';
import { marketCatalog } from '@/features/market/config';
import { type IndexQuote, type InstrumentKey } from '@/features/market/domain';
import { strings } from '@/lib/strings';
import { cn } from '@/lib/utils';
import { decimalsForTick, formatLevel } from '@/utils/format';

interface MarketOverviewTableProps {
  quotes: ReadonlyMap<InstrumentKey, IndexQuote> | undefined;
  isLoading: boolean;
}

const numeric = 'text-right tnum';

/**
 * Dense, grouped index table. Rows are links; columns are the same numbers a
 * trader scans on any terminal: last, change, %, OHLC, capabilities.
 */
export function MarketOverviewTable({ quotes, isLoading }: MarketOverviewTableProps) {
  const tree = marketCatalog.tree();
  const c = strings.market.columns;

  return (
    <div className="overflow-x-auto border-y border-line">
      <table className="w-full min-w-[42rem] text-sm">
        <thead className="text-2xs text-ink-faint">
          <tr className="border-b border-line">
            <th scope="col" className="px-4 py-2 text-left font-normal sm:px-5">
              {c.index}
            </th>
            <th scope="col" className={cn('px-3 py-2 font-normal', numeric)}>
              {c.last}
            </th>
            <th scope="col" className={cn('px-3 py-2 font-normal', numeric)}>
              {c.change}
            </th>
            <th scope="col" className={cn('px-3 py-2 font-normal', numeric)}>
              {c.changePercent}
            </th>
            <th scope="col" className={cn('hidden px-3 py-2 font-normal md:table-cell', numeric)}>
              {c.open}
            </th>
            <th scope="col" className={cn('hidden px-3 py-2 font-normal md:table-cell', numeric)}>
              {c.high}
            </th>
            <th scope="col" className={cn('hidden px-3 py-2 font-normal md:table-cell', numeric)}>
              {c.low}
            </th>
            <th scope="col" className={cn('hidden px-3 py-2 font-normal lg:table-cell', numeric)}>
              {c.prevClose}
            </th>
            <th scope="col" className="px-4 py-2 text-right font-normal sm:px-5">
              {c.features}
            </th>
          </tr>
        </thead>
        {tree.map((exchangeNode) => (
          <tbody key={exchangeNode.exchange.code}>
            <tr className="bg-surface">
              <th
                scope="rowgroup"
                colSpan={9}
                className="px-4 py-1.5 text-left text-xs font-semibold text-ink-muted sm:px-5"
                title={exchangeNode.exchange.fullName}
              >
                {exchangeNode.exchange.name}
              </th>
            </tr>
            {exchangeNode.categories.flatMap((categoryNode) =>
              categoryNode.indexes.map((index) => {
                const quote = quotes?.get(index.instrumentKey);
                const instrument = marketCatalog.instrumentByKey(index.instrumentKey);
                const decimals = decimalsForTick(instrument.tickSize);
                const href = paths.marketIndex(marketCatalog.pathOf(index));
                return (
                  <tr
                    key={index.code}
                    data-testid={`overview-row-${index.slug}`}
                    className="border-t border-line/60 hover:bg-surface-raised/60"
                  >
                    <th scope="row" className="px-4 py-2 text-left font-normal sm:px-5">
                      <Link to={href} className="group flex flex-col">
                        <span className="font-medium text-ink group-hover:text-accent">
                          {index.name}
                        </span>
                        <span className="text-2xs text-ink-faint">
                          {categoryNode.category.name}
                        </span>
                      </Link>
                    </th>
                    {isLoading && !quote ? (
                      <td colSpan={7} className="px-3 py-2">
                        <Skeleton className="h-4 w-full max-w-md" />
                      </td>
                    ) : quote ? (
                      <>
                        <td className={cn('px-3 py-2 font-medium text-ink', numeric)}>
                          <PriceLevel value={quote.ltp} decimals={decimals} />
                        </td>
                        <td className={cn('px-3 py-2', numeric)}>
                          <ChangeValue change={quote.change} decimals={decimals} />
                        </td>
                        <td className={cn('px-3 py-2', numeric)}>
                          <ChangeValue
                            change={quote.change}
                            changePercent={quote.changePercent}
                            percentOnly
                          />
                        </td>
                        <td
                          className={cn('hidden px-3 py-2 text-ink-muted md:table-cell', numeric)}
                        >
                          {formatLevel(quote.open, decimals)}
                        </td>
                        <td
                          className={cn('hidden px-3 py-2 text-ink-muted md:table-cell', numeric)}
                        >
                          {formatLevel(quote.high, decimals)}
                        </td>
                        <td
                          className={cn('hidden px-3 py-2 text-ink-muted md:table-cell', numeric)}
                        >
                          {formatLevel(quote.low, decimals)}
                        </td>
                        <td
                          className={cn('hidden px-3 py-2 text-ink-muted lg:table-cell', numeric)}
                        >
                          {formatLevel(quote.previousClose, decimals)}
                        </td>
                      </>
                    ) : (
                      <td colSpan={7} className={cn('px-3 py-2 text-ink-faint', numeric)}>
                        {strings.market.noQuote}
                      </td>
                    )}
                    <td className="px-4 py-2 text-right text-2xs sm:px-5">
                      {index.capabilities.hasOptionChain ? (
                        <Link
                          to={paths.optionChain(marketCatalog.pathOf(index))}
                          className="text-accent hover:underline"
                        >
                          {strings.market.optionChain}
                        </Link>
                      ) : (
                        <span className="text-ink-faint">{strings.market.volatilityOnly}</span>
                      )}
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        ))}
      </table>
    </div>
  );
}
