import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createTestClient, renderApp } from '@/tests/utils/render';

describe('application routes', () => {
  it('redirects / to /markets and lists all six indexes', async () => {
    const { router } = renderApp('/');
    await waitFor(() => expect(router.state.location.pathname).toBe('/markets'));
    for (const slug of ['nifty-50', 'bank-nifty', 'finnifty', 'india-vix', 'sensex', 'bankex']) {
      expect(await screen.findByTestId(`overview-row-${slug}`)).toBeInTheDocument();
    }
    const vixRow = screen.getByTestId('overview-row-india-vix');
    expect(within(vixRow).queryByRole('link', { name: /option chain/i })).toBeNull();
    expect(within(vixRow).getByText('Volatility index')).toBeInTheDocument();
    const niftyRow = screen.getByTestId('overview-row-nifty-50');
    expect(within(niftyRow).getByRole('link', { name: /option chain/i })).toBeInTheDocument();
  });

  it('renders the index workspace with quote, status, chart and option-chain action', async () => {
    renderApp('/markets/nse/financial/bank-nifty');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'BANK NIFTY' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Simulated')).toBeInTheDocument();
    expect(screen.getByTestId('option-chain-action')).toBeInTheDocument();
    expect(await screen.findByTestId('price-chart')).toBeInTheDocument();
    expect(document.title).toBe('BANK NIFTY · TradeOS');
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'index,follow',
    );
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'http://localhost:5173/markets/nse/financial/bank-nifty',
    );
  });

  it('shows INDIA VIX as chart-only with no option-chain action', async () => {
    renderApp('/markets/nse/volatility/india-vix');
    expect(await screen.findByRole('heading', { level: 1, name: 'INDIA VIX' })).toBeInTheDocument();
    expect(screen.queryByTestId('option-chain-action')).toBeNull();
    expect(screen.getByTestId('option-chain-unavailable')).toBeInTheDocument();
    expect(await screen.findByTestId('price-chart')).toBeInTheDocument();
  });

  it('marks the option-chain screen as private (noindex) and shows the placeholder', async () => {
    renderApp('/markets/nse/benchmark/nifty-50/option-chain');
    expect(await screen.findByText(/coming in the next phase/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
        'noindex,nofollow',
      ),
    );
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it('refuses an option-chain URL for INDIA VIX', async () => {
    renderApp('/markets/nse/volatility/india-vix/option-chain');
    expect(await screen.findByText('No option chain for this index')).toBeInTheDocument();
  });

  it('shows a not-found state for an unknown market path', async () => {
    renderApp('/markets/nse/benchmark/bank-nifty');
    expect(await screen.findByText('Index not found')).toBeInTheDocument();
  });

  it('surfaces a retryable error state when quotes fail', async () => {
    renderApp('/markets', { client: createTestClient({ failWith: new Error('gateway down') }) });
    expect(await screen.findByRole('alert')).toHaveTextContent('Quote unavailable');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('shows the realtime indicator as not connected in phase 1', async () => {
    renderApp('/markets');
    const indicator = await screen.findByText('Not connected');
    expect(indicator.closest('[data-connection]')).toHaveAttribute(
      'data-connection',
      'unavailable',
    );
  });
});
