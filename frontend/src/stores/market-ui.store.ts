import { create } from 'zustand';
import { type CandleInterval } from '@/features/charts/domain';
import { type MarketIndexCode } from '@/features/market/domain';
import { localPreferences } from '@/services/storage/safe-storage';

const LAST_INDEX_KEY = 'tradeos.market.lastIndex';
const INTERVAL_KEY = 'tradeos.chart.interval';

interface MarketUiStore {
  /** Last index the user opened; used to restore the workspace on return. */
  lastIndexCode: MarketIndexCode | null;
  chartInterval: CandleInterval;
  /** Collapsed exchange groups in the navigator (by exchange code). */
  collapsedExchanges: ReadonlySet<string>;
  setLastIndexCode: (code: MarketIndexCode) => void;
  setChartInterval: (interval: CandleInterval) => void;
  toggleExchange: (code: string) => void;
}

function readInterval(): CandleInterval {
  const stored = localPreferences.get(INTERVAL_KEY);
  return stored === '1m' ||
    stored === '5m' ||
    stored === '15m' ||
    stored === '1h' ||
    stored === '1d'
    ? stored
    : '5m';
}

export const useMarketUiStore = create<MarketUiStore>((set, get) => ({
  lastIndexCode: (localPreferences.get(LAST_INDEX_KEY) as MarketIndexCode | null) ?? null,
  chartInterval: readInterval(),
  collapsedExchanges: new Set<string>(),
  setLastIndexCode: (code) => {
    if (get().lastIndexCode === code) return;
    localPreferences.set(LAST_INDEX_KEY, code);
    set({ lastIndexCode: code });
  },
  setChartInterval: (interval) => {
    if (get().chartInterval === interval) return;
    localPreferences.set(INTERVAL_KEY, interval);
    set({ chartInterval: interval });
  },
  toggleExchange: (code) => {
    const next = new Set(get().collapsedExchanges);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    set({ collapsedExchanges: next });
  },
}));
