import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAlertMutations, useAlerts } from '@/hooks/use-user-data';
import { strings } from '@/lib/strings';
import { cn } from '@/lib/utils';
import { type AlertCondition } from '@/services/api/user-data.schemas';

const INDEX_CONDITIONS: AlertCondition[] = [
  'PRICE_ABOVE',
  'PRICE_BELOW',
  'CHANGE_PERCENT_ABOVE',
  'CHANGE_PERCENT_BELOW',
];
const CHAIN_CONDITIONS: AlertCondition[] = ['PCR_ABOVE', 'PCR_BELOW'];

interface AlertsPanelProps {
  instrumentKey: string;
  hasOptionChain: boolean;
  className?: string;
}

/** Server-evaluated alerts for one instrument: set, list, disarm, delete. */
export function AlertsPanel({ instrumentKey, hasOptionChain, className }: AlertsPanelProps) {
  const alerts = useAlerts();
  const m = useAlertMutations();
  const [condition, setCondition] = useState<AlertCondition>('PRICE_ABOVE');
  const [threshold, setThreshold] = useState('');
  const [note, setNote] = useState('');
  const mine = (alerts.data ?? []).filter((a) => a.instrumentKey === instrumentKey);
  const conditions = hasOptionChain ? [...INDEX_CONDITIONS, ...CHAIN_CONDITIONS] : INDEX_CONDITIONS;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = Number(threshold);
    if (!Number.isFinite(value)) return;
    m.create.mutate(
      { instrumentKey, condition, threshold: value, ...(note.trim() ? { note: note.trim() } : {}) },
      {
        onSuccess: () => {
          setThreshold('');
          setNote('');
        },
      },
    );
  };
  return (
    <section
      aria-labelledby="alerts-heading"
      className={cn('flex flex-col gap-2', className)}
      data-testid="alerts-panel"
    >
      <div className="flex items-baseline gap-2">
        <h2
          id="alerts-heading"
          className="text-xs font-semibold uppercase tracking-wide text-ink-muted"
        >
          {strings.alerts.title}
        </h2>
        <span className="text-2xs text-ink-faint">{strings.alerts.evaluatedHint}</span>
      </div>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-1">
        <label className="flex flex-col text-2xs text-ink-faint">
          {strings.alerts.condition}
          <select
            className="h-7 border border-line bg-surface px-1 text-xs text-ink"
            value={condition}
            onChange={(e) => setCondition(e.target.value as AlertCondition)}
          >
            {conditions.map((c) => (
              <option key={c} value={c}>
                {strings.alerts.conditions[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-2xs text-ink-faint">
          {strings.alerts.threshold}
          <input
            className="tnum h-7 w-28 border border-line bg-surface px-2 text-xs text-ink"
            inputMode="decimal"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col text-2xs text-ink-faint">
          {strings.alerts.note}
          <input
            className="h-7 w-40 border border-line bg-surface px-2 text-xs text-ink"
            maxLength={160}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={!threshold || m.create.isPending}
        >
          {strings.alerts.create}
        </Button>
      </form>
      {m.create.isError ? (
        <p role="alert" className="text-xs text-down">
          {m.create.error.message}
        </p>
      ) : null}
      {mine.length === 0 ? (
        <p className="text-xs text-ink-faint">{strings.alerts.empty}</p>
      ) : (
        <ul className="border border-line">
          {mine.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 border-b border-line px-2 py-1 text-xs last:border-b-0"
              data-status={a.status}
            >
              <span className="tnum text-ink">
                {strings.alerts.conditions[a.condition]} {a.threshold}
              </span>
              {a.note ? <span className="truncate text-ink-faint">{a.note}</span> : null}
              <span
                className={cn(
                  'ml-auto text-2xs uppercase',
                  a.status === 'ACTIVE'
                    ? 'text-up'
                    : a.status === 'TRIGGERED'
                      ? 'text-warn'
                      : 'text-ink-faint',
                )}
              >
                {strings.alerts.status[a.status]}
              </span>
              {a.status !== 'TRIGGERED' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    m.toggle.mutate({
                      id: a.id,
                      status: a.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
                    })
                  }
                >
                  {a.status === 'ACTIVE'
                    ? strings.alerts.status.DISABLED
                    : strings.alerts.status.ACTIVE}
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={strings.alerts.remove}
                onClick={() => m.remove.mutate(a.id)}
              >
                ×
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
