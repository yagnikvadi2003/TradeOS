import { Layers } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { paths, routeVisibility } from '@/app/router/paths';
import { EmptyState } from '@/components/common/empty-state';
import { Seo } from '@/components/common/seo';
import { Button } from '@/components/ui/button';
import { marketCatalog } from '@/features/market/config';
import { IndexHeader } from '@/features/market/components/index-header';
import { useIndexQuote } from '@/features/market/hooks/use-index-quotes';
import { useMarketStatus } from '@/features/market/hooks/use-market-status';
import { IndexNotFound } from '@/features/market/pages/index-not-found';
import { strings } from '@/lib/strings';

/**
 * Option-chain route placeholder. Private (noindex). The full grid arrives
 * with the market data gateway; this route already enforces capability
 * gating so a volatility index can never reach an option-chain screen.
 */
export function OptionChainPage() {
  const params = useParams();
  const index = marketCatalog.indexByPath({
    exchange: params.exchange ?? '',
    category: params.category ?? '',
    index: params.index ?? '',
  });

  if (!index) return <IndexNotFound />;
  return <OptionChainContent indexCode={index.code} />;
}

function OptionChainContent({
  indexCode,
}: {
  indexCode: ReturnType<typeof marketCatalog.indexByCode>['code'];
}) {
  const index = marketCatalog.indexByCode(indexCode);
  const status = useMarketStatus(index.exchangeCode);
  const { quote, isLoading } = useIndexQuote(index.instrumentKey);
  const path = marketCatalog.pathOf(index);

  return (
    <>
      <Seo
        title={`${index.name} ${strings.optionChain.title}`}
        description={index.description}
        path={paths.optionChain(path)}
        visibility={routeVisibility.optionChain}
      />
      <IndexHeader
        index={index}
        status={status}
        quote={quote}
        isLoading={isLoading}
        active="option-chain"
      />
      <div className="p-4 sm:p-5">
        {index.capabilities.hasOptionChain ? (
          <EmptyState
            icon={<Layers />}
            title={strings.optionChain.placeholderTitle}
            body={strings.optionChain.placeholderBody}
            action={
              <Button asChild variant="outline" size="sm">
                <Link to={paths.marketIndex(path)}>{strings.optionChain.backToIndex}</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={strings.optionChain.unavailableTitle}
            body={strings.optionChain.unavailableBody}
            action={
              <Button asChild variant="outline" size="sm">
                <Link to={paths.marketIndex(path)}>{strings.optionChain.backToIndex}</Link>
              </Button>
            }
          />
        )}
      </div>
    </>
  );
}
