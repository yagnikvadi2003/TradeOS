import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/tests/utils/render';
import { WatchlistPanel } from './watchlist-panel';

describe('WatchlistPanel', () => {
  it('creates a list, adds and reorders instruments with live rows, removes them', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <MemoryRouter>
        <WatchlistPanel />
      </MemoryRouter>,
    );
    await screen.findByText('No watchlists yet.');
    await user.type(screen.getByLabelText('New watchlist'), 'Core');
    await user.click(screen.getByRole('button', { name: 'New watchlist' }));
    await screen.findByRole('heading', { name: 'Core' });
    const select = screen.getByLabelText('Add to watchlist');
    await user.selectOptions(select, 'NSE:INDEX:NIFTY50');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.getAllByTestId('watchlist-row')).toHaveLength(1));
    await user.selectOptions(select, 'BSE:INDEX:SENSEX');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.getAllByTestId('watchlist-row')).toHaveLength(2));
    expect(screen.getAllByTestId('watchlist-row')[0]).toHaveTextContent('NIFTY 50');
    await user.click(screen.getAllByRole('button', { name: 'Move down' })[0]!);
    await waitFor(() =>
      expect(screen.getAllByTestId('watchlist-row')[0]).toHaveTextContent('SENSEX'),
    );
    await user.click(screen.getByRole('button', { name: 'Remove SENSEX' }));
    await waitFor(() => expect(screen.getAllByTestId('watchlist-row')).toHaveLength(1));
  });
});
