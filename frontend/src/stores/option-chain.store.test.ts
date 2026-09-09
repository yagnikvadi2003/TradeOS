import { beforeEach, describe, expect, it } from 'vitest';
import { useOptionChainStore } from './option-chain.store';

describe('option-chain store', () => {
  beforeEach(() => {
    useOptionChainStore.setState({ selectedExpiry: {}, strikeWindow: 10, columnPreset: 'core' });
  });

  it('tracks the selected expiry per instrument without touching other keys', () => {
    const { selectExpiry } = useOptionChainStore.getState();
    selectExpiry('NSE:INDEX:NIFTY50', '2026-09-15');
    selectExpiry('BSE:INDEX:SENSEX', '2026-09-10');
    expect(useOptionChainStore.getState().selectedExpiry).toEqual({
      'NSE:INDEX:NIFTY50': '2026-09-15',
      'BSE:INDEX:SENSEX': '2026-09-10',
    });
  });

  it('does not emit when the value is unchanged', () => {
    const before = useOptionChainStore.getState().selectedExpiry;
    useOptionChainStore.getState().selectExpiry('NSE:INDEX:NIFTY50', '2026-09-15');
    const after = useOptionChainStore.getState().selectedExpiry;
    useOptionChainStore.getState().selectExpiry('NSE:INDEX:NIFTY50', '2026-09-15');
    expect(useOptionChainStore.getState().selectedExpiry).toBe(after);
    expect(after).not.toBe(before);
  });

  it('persists window and preset', () => {
    useOptionChainStore.getState().setStrikeWindow(null);
    useOptionChainStore.getState().setColumnPreset('extended');
    expect(useOptionChainStore.getState().strikeWindow).toBeNull();
    expect(useOptionChainStore.getState().columnPreset).toBe('extended');
  });
});
