import { useCallback, useEffect, useMemo } from 'react';
import { type Expiry, resolveActiveExpiry } from '@/features/option-chain/domain';
import { Link, useParams } from 'react-router';
import { paths, routeVisibility } from '@/app/router/paths';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { Seo } from '@/components/common/seo';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { marketCatalog } from '@/features/market/config';
import { IndexHeader } from '@/features/market/components/index-header';
import { type MarketIndexCode } from '@/features/market/domain';
import { useIndexQuote } from '@/features/market/hooks/use-index-quotes';
import { useMarketStatus } from '@/features/market/hooks/use-market-status';
import { IndexNotFound } from '@/features/market/pages/index-not-found';
import { OptionChainToolbar } from '@/features/option-chain/components';
import { OptionChainGrid } from '@/features/option-chain/grid/option-chain-grid';
import {
  useOptionChainMetadata,
  useOptionChainSnapshot,
} from '@/features/option-chain/hooks/use-option-chain';
import { strings } from '@/lib/strings';
import { useMarketUiStore } from '@/stores/market-ui.store';
import { useOptionChainStore } from '@/stores/option-chain.store';
import { decimalsForTick } from '@/utils/format';

const NO_EXPIRIES: readonly Expiry[] = [];

/**
 * `/markets/:exchange/:category/:index/option-chain` — private (noindex).
 * Capability-gated: a volatility index reaches the "unavailable" state even
 * on a hand-typed URL, and never issues an option-chain request.
 */
export function OptionChainPage() {
  const params = useParams();
  const index = marketCatalog.indexByPath({
    exchange: params.exchange ?? '',
    category: params.category ?? '',
    index: params.index ?? '',
  });
  if (!index) return <IndexNotFound />;
  return index.capabilities.hasOptionChain ? (
    <OptionChainWorkspace indexCode={index.code} />
  ) : (
    <OptionChainUnavailable indexCode={index.code} />
  );
}

function OptionChainUnavailable({ indexCode }: { indexCode: MarketIndexCode }) {
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
        <EmptyState
          title={strings.optionChain.unavailableTitle}
          body={strings.optionChain.unavailableBody}
          action={
            <Button asChild variant="outline" size="sm">
              <Link to={paths.marketIndex(path)}>{strings.optionChain.backToIndex}</Link>
            </Button>
          }
        />
      </div>
    </>
  );
}

function OptionChainWorkspace({ indexCode }: { indexCode: MarketIndexCode }) {
  const index = marketCatalog.indexByCode(indexCode);
  const instrument = marketCatalog.instrumentByKey(index.instrumentKey);
  const decimals = decimalsForTick(instrument.tickSize);
  const status = useMarketStatus(index.exchangeCode);
  const path = marketCatalog.pathOf(index);
  const setLastIndexCode = useMarketUiStore((s) => s.setLastIndexCode);

  const selectedExpiry = useOptionChainStore((s) => s.selectedExpiry[index.instrumentKey] ?? null);
  const selectExpiry = useOptionChainStore((s) => s.selectExpiry);
  const strikeWindow = useOptionChainStore((s) => s.strikeWindow);
  const columnPreset = useOptionChainStore((s) => s.columnPreset);

  const metadata = useOptionChainMetadata(index.instrumentKey);
  const expiries = metadata.data?.expiries ?? NO_EXPIRIES;
  // Fall back to the nearest listed expiry when nothing (or a lapsed date) is selected.
  const activeExpiry = resolveActiveExpiry(expiries, selectedExpiry);

  const snapshotQuery = useOptionChainSnapshot(index.instrumentKey, activeExpiry);
  const snapshot = snapshotQuery.data ?? null;

  // The chain carries the underlying level; the header renders from it so
  // the two never disagree on screen.
  const headerQuote = useMemo(() => (snapshot ? { ...snapshot.underlying } : null), [snapshot]);

  useEffect(() => {
    setLastIndexCode(index.code);
  }, [index.code, setLastIndexCode]);

  const instrumentKey = index.instrumentKey;
  const onSelectExpiry = useCallback(
    (expiry: string) => selectExpiry(instrumentKey, expiry),
    [instrumentKey, selectExpiry],
  );
  const refetchSnapshot = snapshotQuery.refetch;
  const onRefresh = useCallback(() => void refetchSnapshot(), [refetchSnapshot]);

  const shownStrikes = useMemo(
    () =>
      snapshot
        ? strikeWindow === null
          ? snapshot.strikes.length
          : snapshot.strikes.filter((s) => Math.abs(s.stepsFromAtm) <= strikeWindow).length
        : 0,
    [snapshot, strikeWindow],
  );

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Seo
        title={`${index.name} ${strings.optionChain.title}`}
        description={index.description}
        path={paths.optionChain(path)}
        visibility={routeVisibility.optionChain}
      />
      <IndexHeader
        index={index}
        status={status}
        quote={headerQuote}
        isLoading={snapshotQuery.isPending && !snapshot}
        active="option-chain"
      />
      <OptionChainToolbar
        exchangeCode={index.exchangeCode}
        expiries={expiries}
        selectedExpiry={activeExpiry}
        onSelectExpiry={onSelectExpiry}
        snapshot={snapshot}
        decimals={decimals}
        isRefreshing={snapshotQuery.isFetching}
        onRefresh={onRefresh}
        shownStrikes={shownStrikes}
        totalStrikes={snapshot?.strikes.length ?? 0}
      />
      <div className="relative flex-1 min-h-[420px]">
        {metadata.isError ? (
          <ErrorState
            title={strings.optionChain.error}
            body={strings.optionChain.errorBody}
            detail={metadata.error.message}
            onRetry={() => void metadata.refetch()}
            className="m-4 sm:m-5"
          />
        ) : metadata.isSuccess && expiries.length === 0 ? (
          <EmptyState
            title={strings.optionChain.noExpiries}
            body={strings.optionChain.noExpiriesBody}
            className="m-4 sm:m-5"
          />
        ) : snapshotQuery.isError && !snapshot ? (
          <ErrorState
            title={strings.optionChain.error}
            body={strings.optionChain.errorBody}
            detail={snapshotQuery.error.message}
            onRetry={onRefresh}
            className="m-4 sm:m-5"
          />
        ) : snapshot ? (
          <OptionChainGrid
            snapshot={snapshot}
            columnPreset={columnPreset}
            strikeWindow={strikeWindow}
            tickSize={instrument.tickSize}
            instrumentName={index.name}
          />
        ) : (
          <div
            className="space-y-1.5 p-4 sm:p-5"
            role="status"
            aria-label={strings.optionChain.loading}
          >
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
