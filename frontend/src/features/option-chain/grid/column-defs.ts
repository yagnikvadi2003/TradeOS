import {
  type CellClassParams,
  type ColDef,
  type ColGroupDef,
  type ValueFormatterParams,
  type ValueGetterParams,
} from 'ag-grid-community';
import {
  type OptionChainRow,
  type OptionLeg,
  type OptionType,
} from '@/features/option-chain/domain';
import { strings } from '@/lib/strings';
import { type ColumnPreset } from '@/stores/option-chain.store';
import {
  formatChange,
  formatCompactIndian,
  formatLevel,
  formatPercent,
  formatSignedCompactIndian,
} from '@/utils/format';

export interface ColumnDefOptions {
  readonly preset: ColumnPreset;
  /** Display precision for premiums (from the underlying tick size). */
  readonly decimals: number;
}

type LegField = keyof OptionLeg['market'] | 'delta' | 'gamma' | 'theta' | 'vega';

interface LegColumnSpec {
  readonly id: LegField;
  readonly header: string;
  readonly width: number;
  readonly format: (v: number, decimals: number) => string;
  /** Colour the cell by sign. */
  readonly signed?: boolean;
  readonly extended?: boolean;
  readonly flash?: boolean;
}

const s = strings.optionChain.col;

/** Declared left-to-right for the CALL side; the PUT side is mirrored. */
const LEG_COLUMNS: readonly LegColumnSpec[] = [
  { id: 'delta', header: s.delta, width: 62, format: (v) => v.toFixed(2), extended: true },
  { id: 'theta', header: s.theta, width: 66, format: (v) => v.toFixed(1), extended: true },
  { id: 'vega', header: s.vega, width: 62, format: (v) => v.toFixed(1), extended: true },
  { id: 'gamma', header: s.gamma, width: 70, format: (v) => v.toFixed(4), extended: true },
  {
    id: 'openInterestChange',
    header: s.oiChange,
    width: 78,
    format: formatSignedCompactIndian,
    signed: true,
    flash: true,
  },
  {
    id: 'openInterest',
    header: s.openInterest,
    width: 78,
    format: formatCompactIndian,
    flash: true,
  },
  { id: 'volume', header: s.volume, width: 74, format: formatCompactIndian, flash: true },
  { id: 'impliedVolatility', header: s.iv, width: 60, format: (v) => v.toFixed(1), flash: true },
  {
    id: 'intrinsic',
    header: s.intrinsic,
    width: 66,
    format: (v, d) => formatLevel(v, d),
    extended: true,
  },
  {
    id: 'extrinsic',
    header: s.extrinsic,
    width: 66,
    format: (v, d) => formatLevel(v, d),
    extended: true,
  },
  { id: 'bidQuantity', header: s.bidQty, width: 70, format: formatCompactIndian, extended: true },
  { id: 'bid', header: s.bid, width: 70, format: (v, d) => formatLevel(v, d), flash: true },
  { id: 'ask', header: s.ask, width: 70, format: (v, d) => formatLevel(v, d), flash: true },
  { id: 'askQuantity', header: s.askQty, width: 70, format: formatCompactIndian, extended: true },
  {
    id: 'changePercent',
    header: s.changePercent,
    width: 72,
    format: (v) => formatPercent(v),
    signed: true,
    flash: true,
  },
  {
    id: 'change',
    header: s.change,
    width: 70,
    format: (v, d) => formatChange(v, d),
    signed: true,
    flash: true,
  },
  { id: 'ltp', header: s.ltp, width: 78, format: (v, d) => formatLevel(v, d), flash: true },
];

function legOf(row: OptionChainRow | undefined, side: OptionType): OptionLeg | null {
  if (!row) return null;
  return side === 'CE' ? row.ce : row.pe;
}

function readField(leg: OptionLeg | null, id: LegField): number | null {
  if (!leg) return null;
  switch (id) {
    case 'delta':
    case 'gamma':
    case 'theta':
    case 'vega':
      return leg.market.greeks?.[id] ?? null;
    case 'greeks':
      return null;
    default:
      return leg.market[id];
  }
}

function legColumn(
  spec: LegColumnSpec,
  side: OptionType,
  decimals: number,
): ColDef<OptionChainRow> {
  const moneynessField = side === 'CE' ? 'ceMoneyness' : 'peMoneyness';
  return {
    colId: `${side}.${spec.id}`,
    headerName: spec.header,
    width: spec.width,
    minWidth: spec.width - 10,
    type: 'numericColumn',
    valueGetter: (p: ValueGetterParams<OptionChainRow>) => readField(legOf(p.data, side), spec.id),
    valueFormatter: (p: ValueFormatterParams<OptionChainRow, number | null>) =>
      p.value === null || p.value === undefined ? '—' : spec.format(p.value, decimals),
    enableCellChangeFlash: spec.flash ?? false,
    cellClass: 'tnum',
    cellClassRules: {
      'oc-itm': (p: CellClassParams<OptionChainRow>) => p.data?.[moneynessField] === 'ITM',
      'oc-up': (p: CellClassParams<OptionChainRow, number | null>) =>
        (spec.signed ?? false) && typeof p.value === 'number' && p.value > 0,
      'oc-down': (p: CellClassParams<OptionChainRow, number | null>) =>
        (spec.signed ?? false) && typeof p.value === 'number' && p.value < 0,
      'oc-ltp': () => spec.id === 'ltp',
    },
    suppressMovable: true,
    sortable: false,
    resizable: true,
  };
}

/**
 * Column tree: Calls (mirrored) | Strike | Puts. Definitions are pure data,
 * so the grid receives a stable reference per (preset, decimals) and never
 * rebuilds columns on a tick.
 */
export function buildOptionChainColumnDefs({
  preset,
  decimals,
}: ColumnDefOptions): (ColDef<OptionChainRow> | ColGroupDef<OptionChainRow>)[] {
  const visible = LEG_COLUMNS.filter((c) => preset === 'extended' || !c.extended);
  const calls = visible.map((spec) => legColumn(spec, 'CE', decimals));
  const puts = [...visible].reverse().map((spec) => legColumn(spec, 'PE', decimals));
  const strike: ColDef<OptionChainRow> = {
    colId: 'strike',
    field: 'strike',
    headerName: strings.optionChain.strike,
    width: 90,
    minWidth: 80,
    pinned: false,
    type: 'numericColumn',
    valueFormatter: (p: ValueFormatterParams<OptionChainRow, number>) =>
      typeof p.value === 'number' ? formatLevel(p.value, 0) : '',
    cellClass: 'tnum oc-strike',
    cellClassRules: {
      'oc-strike-atm': (p: CellClassParams<OptionChainRow>) => p.data?.isAtm === true,
    },
    headerClass: 'oc-strike-header',
    suppressMovable: true,
    sortable: false,
    lockPosition: true,
  };
  return [
    { headerName: strings.optionChain.calls, headerClass: 'oc-group oc-group-ce', children: calls },
    { headerName: '', headerClass: 'oc-group', children: [strike] },
    { headerName: strings.optionChain.puts, headerClass: 'oc-group oc-group-pe', children: puts },
  ];
}

export const OPTION_CHAIN_DEFAULT_COL_DEF: ColDef<OptionChainRow> = {
  sortable: false,
  filter: false,
  resizable: true,
  suppressHeaderMenuButton: true,
  suppressHeaderContextMenu: true,
};

export { LEG_COLUMNS };
