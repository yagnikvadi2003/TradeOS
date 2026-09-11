import { type GridApi, type GridReadyEvent, type RowClassParams } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { useMarketStateStore } from '@/stores/market-state.store';
import {
  diffRows,
  mergeRowsLive,
  type OptionChainRow,
  type OptionChainSnapshot,
  snapshotToRows,
  windowRows,
} from '@/features/option-chain/domain';
import { strings } from '@/lib/strings';
import { type ColumnPreset, type StrikeWindow } from '@/stores/option-chain.store';
import { decimalsForTick } from '@/utils/format';
import { buildOptionChainColumnDefs, OPTION_CHAIN_DEFAULT_COL_DEF } from './column-defs';
import { registerOptionChainGridModules } from './register-modules';
import { optionChainGridTheme } from './theme';

registerOptionChainGridModules();

interface OptionChainGridProps {
  snapshot: OptionChainSnapshot;
  columnPreset: ColumnPreset;
  strikeWindow: StrikeWindow;
  tickSize: number;
  instrumentName: string;
}

const rowClassRules = {
  'oc-row-atm': (p: RowClassParams<OptionChainRow>) => p.data?.isAtm === true,
};

const getRowId = (p: { data: OptionChainRow }) => p.data.id;

/**
 * High-frequency-safe grid.
 *
 * - Row identity is the strike (`getRowId`), so every update is a transaction
 *   against existing nodes — the row set is only replaced when the instrument
 *   or expiry changes.
 * - Snapshots are diffed before they reach the grid: rows whose visible values
 *   did not change are skipped entirely, and changed cells flash via
 *   `enableCellChangeFlash` rather than any React re-render.
 * - Column definitions are memoised per (preset, tick size) and never rebuilt
 *   on a tick. The component itself is memoised: props are stable references.
 */
export const OptionChainGrid = memo(function OptionChainGrid({
  snapshot,
  columnPreset,
  strikeWindow,
  tickSize,
  instrumentName,
}: OptionChainGridProps) {
  const apiRef = useRef<GridApi<OptionChainRow> | null>(null);
  const currentRows = useRef<Map<string, OptionChainRow>>(new Map());
  const datasetKey = useRef<string | null>(null);
  const pendingRows = useRef<OptionChainRow[] | null>(null);

  const decimals = decimalsForTick(tickSize);
  const columnDefs = useMemo(
    () => buildOptionChainColumnDefs({ preset: columnPreset, decimals }),
    [columnPreset, decimals],
  );

  const rows = useMemo(
    () => windowRows(snapshotToRows(snapshot), strikeWindow),
    [snapshot, strikeWindow],
  );
  const nextDatasetKey = `${snapshot.instrumentKey}|${snapshot.expiry.expiryDate}|${strikeWindow ?? 'all'}`;

  const scrollToAtm = useCallback(
    (api: GridApi<OptionChainRow>) => {
      const node = api.getRowNode(rows.find((r) => r.isAtm)?.id ?? '');
      if (node) api.ensureNodeVisible(node, 'middle');
    },
    [rows],
  );

  const applyRows = useCallback(
    (api: GridApi<OptionChainRow>, snapshotRows: OptionChainRow[], key: string) => {
      // A REST snapshot never regresses values the stream has already moved past.
      const nextRows = mergeRowsLive(snapshotRows, useMarketStateStore.getState().updates).rows;
      if (datasetKey.current !== key) {
        // Instrument / expiry / window changed: the row set is legitimately new.
        datasetKey.current = key;
        currentRows.current = new Map(nextRows.map((r) => [r.id, r]));
        api.setGridOption('rowData', nextRows);
        requestAnimationFrame(() => scrollToAtm(api));
        return;
      }
      const tx = diffRows(currentRows.current, nextRows);
      if (tx.add.length === 0 && tx.update.length === 0 && tx.remove.length === 0) return;
      for (const r of tx.remove) currentRows.current.delete(r.id);
      for (const r of tx.add) currentRows.current.set(r.id, r);
      for (const r of tx.update) currentRows.current.set(r.id, r);
      api.applyTransactionAsync(tx);
    },
    [scrollToAtm],
  );

  const onGridReady = useCallback(
    (event: GridReadyEvent<OptionChainRow>) => {
      apiRef.current = event.api;
      const queued = pendingRows.current;
      pendingRows.current = null;
      applyRows(event.api, queued ?? rows, nextDatasetKey);
    },
    [applyRows, rows, nextDatasetKey],
  );

  useEffect(() => {
    const api = apiRef.current;
    if (!api || api.isDestroyed()) {
      pendingRows.current = rows;
      return;
    }
    applyRows(api, rows, nextDatasetKey);
  }, [rows, nextDatasetKey, applyRows]);

  // Live path: store batch → merge into the rows the grid holds → one
  // transaction with only the changed rows. Throttled to one grid update per
  // animation frame so a hot feed cannot outrun the screen; React is not involved.
  useEffect(() => {
    let frame: number | null = null;
    // Contract keys touched since the last frame; a burst of batches inside one
    // frame still costs one merge over only the affected rows.
    const dirty = new Set<string>();
    const flush = () => {
      frame = null;
      const api = apiRef.current;
      if (!api || api.isDestroyed() || dirty.size === 0) return;
      const { updates } = useMarketStateStore.getState();
      const candidates: OptionChainRow[] = [];
      for (const row of currentRows.current.values()) {
        if (
          (row.ce && dirty.has(row.ce.contract.contractKey)) ||
          (row.pe && dirty.has(row.pe.contract.contractKey))
        ) {
          candidates.push(row);
        }
      }
      dirty.clear();
      const { changed } = mergeRowsLive(candidates, updates);
      if (changed.length === 0) return;
      for (const r of changed) currentRows.current.set(r.id, r);
      api.applyTransactionAsync({ update: changed });
    };
    const unsubscribe = useMarketStateStore.subscribe((state, previous) => {
      if (state.version === previous.version) return;
      for (const key of state.lastBatchKeys) if (key.includes(':OPT:')) dirty.add(key);
      if (dirty.size) frame ??= requestAnimationFrame(flush);
    });
    return () => {
      unsubscribe();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(
    () => () => {
      apiRef.current = null;
    },
    [],
  );

  return (
    <div
      className="oc-grid h-full min-h-0 w-full"
      role="region"
      aria-label={strings.optionChain.gridLabel(instrumentName, snapshot.expiry.expiryDate)}
      data-testid="option-chain-grid"
      data-rows={rows.length}
    >
      <AgGridReact<OptionChainRow>
        theme={optionChainGridTheme}
        columnDefs={columnDefs}
        defaultColDef={OPTION_CHAIN_DEFAULT_COL_DEF}
        getRowId={getRowId}
        rowClassRules={rowClassRules}
        onGridReady={onGridReady}
        animateRows={false}
        suppressCellFocus
        suppressMovableColumns
        suppressColumnMoveAnimation
        enableCellTextSelection={false}
        cellFlashDuration={600}
        cellFadeDuration={400}
        asyncTransactionWaitMillis={40}
        rowBuffer={8}
        headerHeight={28}
        groupHeaderHeight={24}
        rowHeight={26}
        domLayout="normal"
      />
    </div>
  );
});
