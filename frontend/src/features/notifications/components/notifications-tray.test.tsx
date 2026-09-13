import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestStream, renderWithProviders } from '@/tests/utils/render';
import { useNotificationsStore } from '@/stores/notifications.store';
import { NotificationsTray } from './notifications-tray';

describe('NotificationsTray', () => {
  beforeEach(() => useNotificationsStore.setState({ items: [], unread: 0, seeded: false }));

  it('shows stream notifications with an unread badge and marks them read', async () => {
    const stream = createTestStream();
    const user = userEvent.setup();
    renderWithProviders(<NotificationsTray />, { stream });
    await screen.findByTestId('notifications-toggle');
    act(() =>
      stream.pushNotification({
        id: 'n1',
        alertId: null,
        title: 'NIFTY 50 price above 24000',
        body: 'Observed 24010',
        value: 24010,
        createdAt: Date.now(),
      }),
    );
    expect(await screen.findByTestId('unread-badge')).toHaveTextContent('1');
    await user.click(screen.getByTestId('notifications-toggle'));
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toHaveTextContent(
      'NIFTY 50 price above 24000',
    );
    await user.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(screen.queryByTestId('unread-badge')).toBeNull();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
