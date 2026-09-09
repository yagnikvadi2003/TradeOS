import { type GridApi, type GridReadyEvent, type RowClassParams } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  diffRows,
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
    (api: GridApi<OptionChainRow>, nextRows: OptionChainRow[], key: string) => {
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
