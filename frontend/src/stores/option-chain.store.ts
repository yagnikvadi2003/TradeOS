import { create } from 'zustand';
import { type InstrumentKey } from '@/features/market/domain';
import { type IsoDate } from '@/features/option-chain/domain';
import { localPreferences } from '@/services/storage/safe-storage';

export const STRIKE_WINDOWS = [10, 20, 30, null] as const;
/** Strike steps shown on each side of ATM; `null` = every listed strike. */
export type StrikeWindow = (typeof STRIKE_WINDOWS)[number];

export type ColumnPreset = 'core' | 'extended';

const WINDOW_KEY = 'tradeos.optionChain.window';
const PRESET_KEY = 'tradeos.optionChain.preset';

interface OptionChainStore {
  /** Selected expiry per instrument; `undefined` means "nearest listed". */
  selectedExpiry: Readonly<Record<string, IsoDate>>;
  strikeWindow: StrikeWindow;
  /** `core` hides Greeks and depth quantities; `extended` shows every column. */
  columnPreset: ColumnPreset;
  selectExpiry: (key: InstrumentKey, expiry: IsoDate) => void;
  setStrikeWindow: (window: StrikeWindow) => void;
  setColumnPreset: (preset: ColumnPreset) => void;
}

function readWindow(): StrikeWindow {
  const stored = localPreferences.get(WINDOW_KEY);
  if (stored === 'all') return null;
  const n = Number(stored);
  return n === 10 || n === 20 || n === 30 ? n : 10;
}

function readPreset(): ColumnPreset {
  return localPreferences.get(PRESET_KEY) === 'extended' ? 'extended' : 'core';
}

/**
 * UI state for the option-chain screen. Kept deliberately small: market data
 * lives in the query cache, not here, so ticks never touch this store.
 */
export const useOptionChainStore = create<OptionChainStore>((set, get) => ({
  selectedExpiry: {},
  strikeWindow: readWindow(),
  columnPreset: readPreset(),
  selectExpiry: (key, expiry) => {
    if (get().selectedExpiry[key] === expiry) return;
    set({ selectedExpiry: { ...get().selectedExpiry, [key]: expiry } });
  },
  setStrikeWindow: (window) => {
    if (get().strikeWindow === window) return;
    localPreferences.set(WINDOW_KEY, window === null ? 'all' : String(window));
    set({ strikeWindow: window });
  },
  setColumnPreset: (preset) => {
    if (get().columnPreset === preset) return;
    localPreferences.set(PRESET_KEY, preset);
    set({ columnPreset: preset });
  },
}));
