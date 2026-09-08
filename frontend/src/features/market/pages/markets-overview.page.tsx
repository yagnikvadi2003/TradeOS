import { paths, routeVisibility } from '@/app/router/paths';
import { siteConfig } from '@/app/config/site';
import { ErrorState } from '@/components/common/error-state';
import { Seo } from '@/components/common/seo';
import { MarketStatusBadge } from '@/components/trading/market-status-badge';
import { QuoteSourceBadge } from '@/components/trading/quote-source-badge';
import { MarketOverviewTable } from '@/features/market/components/market-overview-table';
import { marketCatalog } from '@/features/market/config';
import { useIndexQuotes } from '@/features/market/hooks/use-index-quotes';
import { useMarketStatus } from '@/features/market/hooks/use-market-status';
import { strings } from '@/lib/strings';

const ALL_KEYS = marketCatalog.indexes().map((index) => index.instrumentKey);

export function MarketsOverviewPage() {
  const quotes = useIndexQuotes(ALL_KEYS);
  const nse = useMarketStatus('NSE');
  const bse = useMarketStatus('BSE');
  const anyQuote = quotes.data?.values().next().value;

  return (
    <>
      <Seo
        title={strings.market.overviewTitle}
        description={strings.market.overviewDescription}
        path={paths.markets}
        visibility={routeVisibility.markets}
        structuredData={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: strings.market.overviewTitle,
          itemListElement: marketCatalog.indexes().map((index, position) => ({
            '@type': 'ListItem',
            position: position + 1,
            name: index.name,
            url: `${siteConfig.origin}${paths.marketIndex(marketCatalog.pathOf(index))}`,
          })),
        }}
      />
      <div className="px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink">
              {strings.market.overviewTitle}
            </h1>
            <p className="mt-1 max-w-prose text-sm text-ink-muted">{strings.market.overviewLead}</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-xs">
              <span className="text-ink-faint">NSE</span>
              <MarketStatusBadge status={nse} />
            </span>
            <span className="flex items-center gap-1.5 text-xs">
              <span className="text-ink-faint">BSE</span>
              <MarketStatusBadge status={bse} />
            </span>
            {anyQuote ? <QuoteSourceBadge source={anyQuote.source} /> : null}
          </div>
        </div>
      </div>

      {quotes.isError ? (
        <ErrorState
          title={strings.market.quoteError}
          body={strings.market.quoteErrorBody}
          detail={quotes.error.message}
          onRetry={() => void quotes.refetch()}
          className="mx-4 mb-4 sm:mx-5"
        />
      ) : null}

      <MarketOverviewTable quotes={quotes.data} isLoading={quotes.isPending} />
    </>
  );
}
