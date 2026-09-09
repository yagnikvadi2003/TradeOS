import {
  CellStyleModule,
  ClientSideRowModelApiModule,
  ClientSideRowModelModule,
  ColumnApiModule,
  HighlightChangesModule,
  ModuleRegistry,
  RowApiModule,
  RowStyleModule,
  ScrollApiModule,
  ValidationModule,
} from 'ag-grid-community';
import { env } from '@/app/config/env';

let registered = false;

/**
 * Register only the AG Grid modules the chain needs. Tree-shaking the rest
 * keeps the option-chain chunk small; validation is dev-only.
 */
export function registerOptionChainGridModules(): void {
  if (registered) return;
  registered = true;
  ModuleRegistry.registerModules([
    ClientSideRowModelModule,
    ClientSideRowModelApiModule,
    HighlightChangesModule,
    CellStyleModule,
    RowStyleModule,
    ColumnApiModule,
    RowApiModule,
    ScrollApiModule,
    ...(env.DEV ? [ValidationModule] : []),
  ]);
}
