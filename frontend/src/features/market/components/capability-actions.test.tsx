import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { marketCatalog } from '@/features/market/config';
import { CapabilityActions } from './capability-actions';

describe('CapabilityActions', () => {
  it.each(['NIFTY_50', 'BANK_NIFTY', 'FINNIFTY', 'SENSEX', 'BANKEX'] as const)(
    'shows the Option chain action for %s',
    (code) => {
      render(
        <MemoryRouter>
          <CapabilityActions index={marketCatalog.indexByCode(code)} active="chart" />
        </MemoryRouter>,
      );
      expect(screen.getByTestId('option-chain-action')).toHaveAttribute(
        'href',
        expect.stringMatching(/\/option-chain$/),
      );
    },
  );

  it('never shows an Option chain action for INDIA VIX', () => {
    render(
      <MemoryRouter>
        <CapabilityActions index={marketCatalog.indexByCode('INDIA_VIX')} active="chart" />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('option-chain-action')).toBeNull();
    expect(screen.getByTestId('option-chain-unavailable')).toHaveTextContent('Volatility index');
    expect(screen.getByRole('link', { name: /chart/i })).toBeInTheDocument();
  });
});
