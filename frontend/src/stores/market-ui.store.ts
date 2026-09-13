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
  /** Enabled price overlays (TradeOS-derived indicators). */
  chartOverlays: readonly ChartOverlayId[];
  toggleOverlay: (id: ChartOverlayId) => void;
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

export const CHART_OVERLAY_IDS = ['sma20', 'ema50', 'bb20'] as const;
export type ChartOverlayId = (typeof CHART_OVERLAY_IDS)[number];
const OVERLAYS_KEY = 'chart.overlays';
function readOverlays(): ChartOverlayId[] {
  const raw = localPreferences.get(OVERLAYS_KEY);
  if (typeof raw !== 'string' || !raw) return [];
  return raw
    .split(',')
    .filter((x): x is ChartOverlayId => (CHART_OVERLAY_IDS as readonly string[]).includes(x));
}

export const useMarketUiStore = create<MarketUiStore>((set, get) => ({
  lastIndexCode: (localPreferences.get(LAST_INDEX_KEY) as MarketIndexCode | null) ?? null,
  chartInterval: readInterval(),
  chartOverlays: readOverlays(),
  collapsedExchanges: new Set<string>(),
  toggleOverlay: (id) => {
    const current = get().chartOverlays;
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    localPreferences.set(OVERLAYS_KEY, next.join(','));
    set({ chartOverlays: next });
  },
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
