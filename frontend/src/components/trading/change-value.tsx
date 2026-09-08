import { directionOf, type ChangeDirection } from '@/features/market/domain';
import { cn } from '@/lib/utils';
import { formatChange, formatPercent } from '@/utils/format';

const directionClass: Record<ChangeDirection, string> = {
  up: 'text-up',
  down: 'text-down',
  flat: 'text-flat',
};

interface ChangeValueProps {
  change: number;
  changePercent?: number;
  decimals?: number;
  className?: string;
  /** Render only the percentage. */
  percentOnly?: boolean;
}

/** Sign-aware, colour-coded change. Colour follows the sign, never the theme. */
export function ChangeValue({
  change,
  changePercent,
  decimals = 2,
  className,
  percentOnly = false,
}: ChangeValueProps) {
  const direction = directionOf(change);
  return (
    <span className={cn('tnum', directionClass[direction], className)} data-direction={direction}>
      {percentOnly ? null : formatChange(change, decimals)}
      {changePercent !== undefined ? (
        <span className={cn(!percentOnly && 'ml-1.5')}>{formatPercent(changePercent)}</span>
      ) : null}
    </span>
  );
}
