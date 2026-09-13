import { useEffect } from 'react';
import { useParams } from 'react-router';
import { paths, routeVisibility } from '@/app/router/paths';
import { siteConfig } from '@/app/config/site';
import { ErrorState } from '@/components/common/error-state';
import { Seo } from '@/components/common/seo';
import { ChartPanel } from '@/features/charts/components/chart-panel';
import { IndexHeader } from '@/features/market/components/index-header';
import { marketCatalog } from '@/features/market/config';
import { type MarketIndexCode } from '@/features/market/domain';
import { AlertsPanel } from '@/features/alerts/components/alerts-panel';
import { useLiveIndexQuote } from '@/features/market/hooks/use-live-index-quote';
import { useMarketStatus } from '@/features/market/hooks/use-market-status';
import { strings } from '@/lib/strings';
import { useMarketUiStore } from '@/stores/market-ui.store';
import { IndexNotFound } from './index-not-found';

/** `/markets/:exchange/:category/:index` — resolves the index from config. */
export function MarketIndexPage() {
  const params = useParams();
  const index = marketCatalog.indexByPath({
    exchange: params.exchange ?? '',
    category: params.category ?? '',
    index: params.index ?? '',
  });
  if (!index) return <IndexNotFound />;
  return <MarketIndexWorkspace indexCode={index.code} />;
}

function MarketIndexWorkspace({ indexCode }: { indexCode: MarketIndexCode }) {
  const index = marketCatalog.indexByCode(indexCode);
  const status = useMarketStatus(index.exchangeCode);
  const { quote, isLoading, isError, error, refetch } = useLiveIndexQuote(index.instrumentKey);
  const setLastIndexCode = useMarketUiStore((s) => s.setLastIndexCode);
  const path = marketCatalog.pathOf(index);

  useEffect(() => {
    setLastIndexCode(index.code);
  }, [index.code, setLastIndexCode]);

  return (
    <div className="flex min-h-full flex-col">
      <Seo
        title={index.name}
        description={index.description}
        path={paths.marketIndex(path)}
        visibility={routeVisibility.marketIndex}
        structuredData={{
          '@context': 'https://schema.org',
          '@type': 'FinancialProduct',
          name: index.name,
          description: index.description,
          url: `${siteConfig.origin}${paths.marketIndex(path)}`,
          provider: {
            '@type': 'Organization',
            name: marketCatalog.exchangeByCode(index.exchangeCode).fullName,
          },
        }}
      />
      <IndexHeader
        index={index}
        status={status}
        quote={quote}
        isLoading={isLoading}
        active="chart"
      />
      {isError ? (
        <ErrorState
          title={strings.market.quoteError}
          body={strings.market.quoteErrorBody}
          detail={error.message}
          onRetry={() => void refetch()}
          className="m-4 sm:m-5"
        />
      ) : null}
      <ChartPanel index={index} />
      <AlertsPanel
        instrumentKey={index.instrumentKey}
        hasOptionChain={index.capabilities.hasOptionChain}
        className="border-t border-line p-4 sm:p-5"
      />
    </div>
  );
}
