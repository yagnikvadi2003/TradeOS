import { marketCatalog } from '@/features/market/config';
import { type MarketPhase, type MarketStatus } from '@/features/market/domain';
import { strings } from '@/lib/strings';
import { cn } from '@/lib/utils';
import { formatIstShortTime, formatMinutesOfDay } from '@/utils/format';
import { StatusDot, type StatusTone } from './status-dot';

const phaseTone: Record<MarketPhase, StatusTone> = {
  PRE_OPEN: 'warn',
  OPEN: 'up',
  POST_CLOSE: 'info',
  CLOSED: 'faint',
  UNKNOWN: 'faint',
};

interface MarketStatusBadgeProps {
  status: MarketStatus;
  /** Show the next transition ("Closes 15:30") next to the phase. */
  withNext?: boolean;
  className?: string;
}

export function MarketStatusBadge({ status, withNext = false, className }: MarketStatusBadgeProps) {
  const label = strings.status.phase[status.phase];
  const session = marketCatalog.sessionOf(status.exchangeCode);
  let next: string | null = null;
  if (withNext && status.nextTransitionAt !== null) {
    if (status.phase === 'OPEN') {
      next = strings.status.closesAt(formatMinutesOfDay(session.regular.endMinutes));
    } else if (status.isTradingDay && status.phase !== 'POST_CLOSE') {
      next = strings.status.opensAt(formatIstShortTime(status.nextTransitionAt));
    } else if (!status.isTradingDay) {
      next = strings.status.nextTradingDay;
    }
  }
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-xs', className)}
      title={strings.status.sessionHours}
      data-phase={status.phase}
    >
      <StatusDot tone={phaseTone[status.phase]} pulse={status.phase === 'OPEN'} />
      <span className="font-medium text-ink">{label}</span>
      {next ? <span className="text-ink-faint">{next}</span> : null}
    </span>
  );
}
