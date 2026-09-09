import { render } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { simulateExpiries, simulateSnapshot } from '@/services/api/option-chain.simulator';

/**
 * AG Grid is replaced by a stub that captures its props and hands the
 * component a fake GridApi. This isolates the contract that matters for
 * high-frequency data: the row set is replaced only when the dataset
 * changes, and every subsequent snapshot becomes a transaction.
 */
const fakeApi = {
  setGridOption: vi.fn(),
  applyTransactionAsync: vi.fn(),
  getRowNode: vi.fn(() => null),
  ensureNodeVisible: vi.fn(),
  isDestroyed: vi.fn(() => false),
};
let capturedProps: Record<string, unknown> = {};

vi.mock('ag-grid-react', () => ({
  AgGridReact: (props: Record<string, unknown> & { onGridReady?: (e: unknown) => void }) => {
    capturedProps = props;
    // Fire ready synchronously on first mount, like the real grid does after layout.
    if (!readyFired) {
      readyFired = true;
      props.onGridReady?.({ api: fakeApi });
    }
    return <div data-testid="ag-grid-stub" />;
  },
}));
let readyFired = false;

const { OptionChainGrid } = await import('./option-chain-grid');

const NOW = Date.UTC(2026, 8, 8, 5, 30);
const KEY = 'NSE:INDEX:NIFTY50' as const;
const expiry = simulateExpiries(KEY, NOW)[0]!;

function snapshot(bucket: number) {
  return simulateSnapshot(KEY, expiry, bucket, 15);
}

describe('OptionChainGrid', () => {
  beforeEach(() => {
    readyFired = false;
    fakeApi.setGridOption.mockClear();
    fakeApi.applyTransactionAsync.mockClear();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  it('configures stable row ids, cell flashing and no row animation', () => {
    render(
      <OptionChainGrid
        snapshot={snapshot(NOW)}
        columnPreset="core"
        strikeWindow={null}
        tickSize={0.05}
        instrumentName="NIFTY 50"
      />,
    );
    expect(capturedProps.animateRows).toBe(false);
    expect(typeof capturedProps.getRowId).toBe('function');
    expect(capturedProps.cellFlashDuration).toBeGreaterThan(0);
    expect(fakeApi.setGridOption).toHaveBeenCalledWith('rowData', expect.any(Array));
    expect((fakeApi.setGridOption.mock.calls[0]?.[1] as unknown[]).length).toBe(31);
    expect(fakeApi.applyTransactionAsync).not.toHaveBeenCalled();
  });

  it('applies a transaction for a new snapshot of the same expiry instead of replacing rows', () => {
    const { rerender } = render(
      <OptionChainGrid
        snapshot={snapshot(NOW)}
        columnPreset="core"
        strikeWindow={null}
        tickSize={0.05}
        instrumentName="NIFTY 50"
      />,
    );
    fakeApi.setGridOption.mockClear();
    act(() => {
      rerender(
        <OptionChainGrid
          snapshot={snapshot(NOW + 120_000)}
          columnPreset="core"
          strikeWindow={null}
          tickSize={0.05}
          instrumentName="NIFTY 50"
        />,
      );
    });
    expect(fakeApi.setGridOption).not.toHaveBeenCalled();
    expect(fakeApi.applyTransactionAsync).toHaveBeenCalledTimes(1);
    const tx = fakeApi.applyTransactionAsync.mock.calls[0]?.[0] as {
      update: unknown[];
      add: unknown[];
    };
    expect(tx.add).toHaveLength(0);
    expect(tx.update.length).toBeGreaterThan(0);
  });

  it('skips the grid entirely when nothing visible changed', () => {
    const first = snapshot(NOW);
    const { rerender } = render(
      <OptionChainGrid
        snapshot={first}
        columnPreset="core"
        strikeWindow={null}
        tickSize={0.05}
        instrumentName="NIFTY 50"
      />,
    );
    fakeApi.setGridOption.mockClear();
    act(() => {
      rerender(
        <OptionChainGrid
          snapshot={snapshot(NOW)}
          columnPreset="core"
          strikeWindow={null}
          tickSize={0.05}
          instrumentName="NIFTY 50"
        />,
      );
    });
    expect(fakeApi.setGridOption).not.toHaveBeenCalled();
    expect(fakeApi.applyTransactionAsync).not.toHaveBeenCalled();
  });

  it('replaces the row set when the strike window changes and scrolls to ATM', () => {
    const { rerender } = render(
      <OptionChainGrid
        snapshot={snapshot(NOW)}
        columnPreset="core"
        strikeWindow={null}
        tickSize={0.05}
        instrumentName="NIFTY 50"
      />,
    );
    fakeApi.setGridOption.mockClear();
    act(() => {
      rerender(
        <OptionChainGrid
          snapshot={snapshot(NOW)}
          columnPreset="core"
          strikeWindow={10}
          tickSize={0.05}
          instrumentName="NIFTY 50"
        />,
      );
    });
    expect(fakeApi.setGridOption).toHaveBeenCalledTimes(1);
    expect((fakeApi.setGridOption.mock.calls[0]?.[1] as unknown[]).length).toBeLessThan(31);
    expect(fakeApi.getRowNode).toHaveBeenCalled();
  });
});
