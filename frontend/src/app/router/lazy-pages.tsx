import { lazy } from 'react';

/** Code-split screens. The option-chain screen will carry AG Grid later. */
export const OptionChainPage = lazy(() =>
  import('@/features/option-chain/pages/option-chain.page').then((m) => ({
    default: m.OptionChainPage,
  })),
);
