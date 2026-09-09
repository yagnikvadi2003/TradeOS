import { ConnectionIndicator } from '@/components/trading/connection-indicator';
import { strings } from '@/lib/strings';
import { cn } from '@/lib/utils';
import { useConnectionStore } from '@/stores/connection.store';

/**
 * Realtime link state for the chain. Until the gateway exists the store rests
 * in `unavailable`, and the label makes explicit that the grid is showing a
 * REST snapshot rather than a stream.
 */
export function ConnectionStatus({ className }: { className?: string }) {
  const state = useConnectionStore((s) => s.state);
  return (
    <span
      className={cn('inline-flex items-center gap-2', className)}
      data-testid="connection-status"
    >
      <ConnectionIndicator />
      {state === 'unavailable' || state === 'idle' ? (
        <span className="text-2xs text-ink-faint" title={strings.optionChain.snapshotModeHint}>
          {strings.optionChain.snapshotMode}
        </span>
      ) : null}
    </span>
  );
}
