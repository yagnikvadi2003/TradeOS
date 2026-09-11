import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { type MockMarketStream } from '@/services/websocket/mock-market-stream';
import { useMarketStateStore } from '@/stores/market-state.store';
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

  it('renders the option-chain screen (private, noindex) with toolbar and grid', async () => {
    renderApp('/markets/nse/benchmark/nifty-50/option-chain');
    expect(await screen.findByTestId('option-chain-grid')).toBeInTheDocument();
    expect(screen.getByTestId('option-chain-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('expiry-selector')).toBeInTheDocument();
    expect(screen.getAllByRole('radio').length).toBeGreaterThan(1);
    expect(screen.getByTestId('atm-indicator')).toBeInTheDocument();
    expect(screen.getByTestId('data-freshness')).toBeInTheDocument();
    expect(screen.getByTestId('option-chain-grid')).toHaveAttribute('data-rows', '21');
    expect(document.title).toBe('NIFTY 50 Option chain · TradeOS');
    await waitFor(() =>
      expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
        'noindex,nofollow',
      ),
    );
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it('switches expiry from the selector without a full reload', async () => {
    const user = userEvent.setup();
    renderApp('/markets/bse/benchmark/sensex/option-chain');
    await screen.findByTestId('option-chain-grid');
    const radios = screen.getAllByRole('radio');
    await user.click(radios[1]!);
    await waitFor(() => expect(radios[1]).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByTestId('option-chain-grid').getAttribute('aria-label')).toContain(
      radios[1]!.getAttribute('data-expiry')!,
    );
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

  it('keeps the stream idle on pages without live subscriptions and goes live on an index page', async () => {
    const { stream } = renderApp('/markets');
    const idle = await screen.findByText('Off');
    expect(idle.closest('[data-connection]')).toHaveAttribute('data-connection', 'idle');
    expect(stream.info.state).toBe('idle');
  });

  it('subscribes the index page to the underlying and paints live ticks into the header', async () => {
    const { stream } = renderApp('/markets/nse/financial/bank-nifty');
    await screen.findByRole('heading', { name: 'BANK NIFTY' });
    await waitFor(() =>
      expect((stream as MockMarketStream).retainedKeys.has('NSE:INDEX:BANKNIFTY')).toBe(true),
    );
    expect(document.querySelector('[data-connection]')).toHaveAttribute(
      'data-connection',
      'connected',
    );
    await waitFor(() =>
      expect(useMarketStateStore.getState().updates['NSE:INDEX:BANKNIFTY']).toBeDefined(),
    );
    const live = useMarketStateStore.getState().updates['NSE:INDEX:BANKNIFTY'];
    expect(live?.kind).toBe('index');
    expect(live?.source).toBe('simulated');
  });

  it('retains every visible contract of the option chain and releases them on navigation', async () => {
    const { stream, router } = renderApp('/markets/nse/benchmark/nifty-50/option-chain');
    await screen.findByTestId('option-chain-grid');
    const mock = stream as MockMarketStream;
    await waitFor(() => expect(mock.retainedKeys.size).toBe(1 + 21 * 2));
    expect(mock.retainedKeys.has('NSE:INDEX:NIFTY50')).toBe(true);
    await act(() => router.navigate('/markets'));
    await waitFor(() => expect(mock.retainedKeys.size).toBe(0));
  });
});
