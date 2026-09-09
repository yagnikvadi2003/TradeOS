import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QuoteSourceBadge } from '@/components/trading/quote-source-badge';
import { type ExchangeCode } from '@/features/market/domain';
import {
  type Expiry,
  type IsoDate,
  type OptionChainSnapshot,
} from '@/features/option-chain/domain';
import { strings } from '@/lib/strings';
import { cn } from '@/lib/utils';
import {
  type ColumnPreset,
  STRIKE_WINDOWS,
  type StrikeWindow,
  useOptionChainStore,
} from '@/stores/option-chain.store';
import { AtmIndicator } from './atm-indicator';
import { ConnectionStatus } from './connection-status';
import { DataFreshnessIndicator } from './data-freshness-indicator';
import { ExpirySelector } from './expiry-selector';
import { MarketStatus } from './market-status';

interface OptionChainToolbarProps {
  exchangeCode: ExchangeCode;
  expiries: readonly Expiry[];
  selectedExpiry: IsoDate | null;
  onSelectExpiry: (expiry: IsoDate) => void;
  snapshot: OptionChainSnapshot | null;
  decimals: number;
  isRefreshing: boolean;
  onRefresh: () => void;
  shownStrikes: number;
  totalStrikes: number;
}

/**
 * Two quiet rows above the grid. Row 1: expiries and the ATM reference.
 * Row 2: view controls (strike window, column preset), refresh, and the
 * three status signals (session, data age, realtime link).
 */
export function OptionChainToolbar({
  exchangeCode,
  expiries,
  selectedExpiry,
  onSelectExpiry,
  snapshot,
  decimals,
  isRefreshing,
  onRefresh,
  shownStrikes,
  totalStrikes,
}: OptionChainToolbarProps) {
  const strikeWindow = useOptionChainStore((s) => s.strikeWindow);
  const setStrikeWindow = useOptionChainStore((s) => s.setStrikeWindow);
  const columnPreset = useOptionChainStore((s) => s.columnPreset);
  const setColumnPreset = useOptionChainStore((s) => s.setColumnPreset);

  return (
    <div className="border-b border-line bg-surface" data-testid="option-chain-toolbar">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2 sm:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-2xs text-ink-faint">{strings.optionChain.expiry}</span>
          <ExpirySelector expiries={expiries} selected={selectedExpiry} onSelect={onSelectExpiry} />
        </div>
        {snapshot ? <AtmIndicator snapshot={snapshot} decimals={decimals} /> : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line px-4 py-1.5 sm:px-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Segmented<StrikeWindow>
            label={strings.optionChain.strikes}
            value={strikeWindow}
            options={STRIKE_WINDOWS.map((w) => ({
              value: w,
              label: strings.optionChain.strikeWindow(w),
            }))}
            onChange={setStrikeWindow}
            testId="strike-window"
          />
          <Segmented<ColumnPreset>
            label={strings.optionChain.columnsLabel}
            value={columnPreset}
            options={[
              { value: 'core', label: strings.optionChain.columns.core },
              { value: 'extended', label: strings.optionChain.columns.extended },
            ]}
            onChange={setColumnPreset}
            testId="column-preset"
          />
          <span className="tnum text-2xs text-ink-faint">
            {strings.optionChain.rowCount(shownStrikes, totalStrikes)}
          </span>
          <Button
            variant="ghost"
            size="xs"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label={strings.optionChain.refresh}
            data-testid="refresh-snapshot"
          >
            <RefreshCw className={cn(isRefreshing && 'animate-spin')} />
            {isRefreshing ? strings.optionChain.refreshing : strings.optionChain.refresh}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {snapshot ? <QuoteSourceBadge source={snapshot.source} /> : null}
          <MarketStatus exchangeCode={exchangeCode} />
          {snapshot ? <DataFreshnessIndicator oldestUpdateAt={snapshot.oldestUpdateAt} /> : null}
          <ConnectionStatus />
        </div>
      </div>
    </div>
  );
}

interface SegmentedProps<T> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  testId: string;
}

function Segmented<T extends string | number | null>({
  label,
  value,
  options,
  onChange,
  testId,
}: SegmentedProps<T>) {
  return (
    <div className="flex items-center gap-1.5" data-testid={testId}>
      <span className="text-2xs text-ink-faint">{label}</span>
      <div role="group" aria-label={label} className="inline-flex border border-line">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={String(option.value)}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={cn(
                'tnum h-6 px-2 text-2xs transition-colors',
                active ? 'bg-surface-raised text-ink' : 'text-ink-muted hover:text-ink',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
