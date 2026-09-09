import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { type Expiry } from '@/features/option-chain/domain';
import { ExpirySelector } from './expiry-selector';

const expiries: Expiry[] = [
  {
    instrumentKey: 'NSE:INDEX:NIFTY50',
    expiryDate: '2026-09-15',
    cycle: 'WEEKLY',
    daysToExpiry: 6,
  },
  {
    instrumentKey: 'NSE:INDEX:NIFTY50',
    expiryDate: '2026-09-22',
    cycle: 'WEEKLY',
    daysToExpiry: 13,
  },
  {
    instrumentKey: 'NSE:INDEX:NIFTY50',
    expiryDate: '2026-09-29',
    cycle: 'MONTHLY',
    daysToExpiry: 20,
  },
];

describe('ExpirySelector', () => {
  it('renders a radiogroup with the selected expiry checked and focusable', () => {
    render(<ExpirySelector expiries={expiries} selected="2026-09-22" onSelect={() => {}} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(radios[1]).toHaveAttribute('aria-checked', 'true');
    expect(radios[1]).toHaveAttribute('tabindex', '0');
    expect(radios[0]).toHaveAttribute('tabindex', '-1');
    expect(radios[2]).toHaveTextContent('M');
  });

  it('selects on click and moves with arrow keys, wrapping at the ends', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ExpirySelector expiries={expiries} selected="2026-09-29" onSelect={onSelect} />);
    await user.click(screen.getAllByRole('radio')[0]!);
    expect(onSelect).toHaveBeenLastCalledWith('2026-09-15');
    screen.getAllByRole('radio')[2]!.focus();
    await user.keyboard('{ArrowRight}');
    expect(onSelect).toHaveBeenLastCalledWith('2026-09-15');
    expect(screen.getAllByRole('radio')[0]).toHaveFocus();
    await user.keyboard('{End}');
    expect(onSelect).toHaveBeenLastCalledWith('2026-09-29');
  });
});
