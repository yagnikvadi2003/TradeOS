import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '@/tests/utils/render';

describe('MarketNavigator', () => {
  it('renders the Exchange → Category → Index hierarchy from configuration', async () => {
    renderApp('/markets');
    const tree = (await screen.findAllByRole('tree'))[0]!;
    expect(tree).toHaveTextContent('NSE');
    expect(tree).toHaveTextContent('Benchmark');
    expect(tree).toHaveTextContent('Financial');
    expect(tree).toHaveTextContent('Volatility');
    expect(tree).toHaveTextContent('BSE');
    expect(screen.getAllByTestId('nav-nifty-50')).not.toHaveLength(0);
    expect(screen.getAllByTestId('nav-india-vix')).not.toHaveLength(0);
  });

  it('supports arrow-key navigation and Enter to open an index', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/markets/nse/benchmark/nifty-50');
    const nifty = (await screen.findAllByTestId('nav-nifty-50'))[0]!;
    expect(nifty).toHaveAttribute('aria-current', 'page');
    expect(nifty).toHaveAttribute('tabindex', '0');

    nifty.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByTestId('nav-bank-nifty')[0]).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(screen.getAllByTestId('nav-india-vix')[0]).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(router.state.location.pathname).toBe('/markets/nse/volatility/india-vix');
  });

  it('collapses an exchange with ArrowLeft and hides its indexes', async () => {
    const user = userEvent.setup();
    renderApp('/markets/bse/benchmark/sensex');
    const sensex = (await screen.findAllByTestId('nav-sensex'))[0]!;
    sensex.focus();
    await user.keyboard('{ArrowLeft}');
    const bseHeader = screen.getAllByRole('treeitem', { name: /BSE/ })[0]!;
    expect(bseHeader).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{ArrowLeft}');
    expect(bseHeader).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('nav-sensex')).toBeNull();
  });
});
