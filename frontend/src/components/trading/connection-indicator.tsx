import { strings } from '@/lib/strings';
import { cn } from '@/lib/utils';
import { type ConnectionState } from '@/services/websocket/connection-state';
import { useConnectionStore } from '@/stores/connection.store';
import { StatusDot, type StatusTone } from './status-dot';

const tone: Record<ConnectionState, StatusTone> = {
  idle: 'faint',
  connecting: 'warn',
  connected: 'up',
  reconnecting: 'warn',
  disconnected: 'down',
  unavailable: 'faint',
};

/**
 * Realtime link status. Reads a single slice of the connection store so it
 * re-renders only on state changes, not on every message.
 */
export function ConnectionIndicator({ className }: { className?: string }) {
  const state = useConnectionStore((s) => s.state);
  const latencyMs = useConnectionStore((s) => s.latencyMs);
  const label = strings.realtime[state];
  const pulse = state === 'connecting' || state === 'reconnecting' || state === 'connected';

  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-xs', className)}
      title={state === 'unavailable' ? strings.realtime.unavailableHint : undefined}
      data-connection={state}
      aria-live="polite"
    >
      <span className="text-ink-faint">{strings.realtime.label}</span>
      <StatusDot tone={tone[state]} pulse={pulse} />
      <span className="text-ink-muted">{label}</span>
      {latencyMs !== null ? <span className="tnum text-ink-faint">{latencyMs} ms</span> : null}
    </span>
  );
}
