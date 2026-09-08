import { cn } from '@/lib/utils';

export type StatusTone = 'up' | 'down' | 'flat' | 'accent' | 'info' | 'warn' | 'faint';

const toneClass: Record<StatusTone, string> = {
  up: 'bg-up',
  down: 'bg-down',
  flat: 'bg-flat',
  accent: 'bg-accent',
  info: 'bg-info',
  warn: 'bg-warn',
  faint: 'bg-ink-faint',
};

interface StatusDotProps {
  tone: StatusTone;
  /** Slow pulse for "live"/"connecting" — a state signal, not decoration. */
  pulse?: boolean;
  className?: string;
}

export function StatusDot({ tone, pulse = false, className }: StatusDotProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block size-1.5 rounded-full',
        toneClass[tone],
        pulse && 'pulse-dot',
        className,
      )}
    />
  );
}
