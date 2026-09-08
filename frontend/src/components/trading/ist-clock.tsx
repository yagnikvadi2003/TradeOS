import { useIstClock } from '@/hooks/use-ist-clock';
import { strings } from '@/lib/strings';
import { cn } from '@/lib/utils';
import { formatIstDate, formatIstTime } from '@/utils/format';

export function IstClock({ className }: { className?: string }) {
  const now = useIstClock();
  return (
    <time
      dateTime={new Date(now).toISOString()}
      className={cn('tnum inline-flex items-baseline gap-1.5 text-xs text-ink-muted', className)}
    >
      <span className="hidden sm:inline text-ink-faint">{formatIstDate(now)}</span>
      <span className="text-ink">{formatIstTime(now)}</span>
      <span className="text-ink-faint">{strings.status.istClock}</span>
    </time>
  );
}
