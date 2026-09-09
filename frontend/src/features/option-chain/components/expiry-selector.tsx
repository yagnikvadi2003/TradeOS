import { type KeyboardEvent, useCallback } from 'react';
import { type Expiry, type IsoDate } from '@/features/option-chain/domain';
import { strings } from '@/lib/strings';
import { cn } from '@/lib/utils';
import { formatIsoDateShort } from '@/utils/format';

interface ExpirySelectorProps {
  expiries: readonly Expiry[];
  selected: IsoDate | null;
  onSelect: (expiry: IsoDate) => void;
  className?: string;
}

/**
 * Expiry chips as a WAI-ARIA radiogroup: arrow keys move, the selected chip
 * is the tab stop. Cycle (W/M) and days-to-expiry ride along in each chip so
 * the trader never has to open a menu to compare expiries.
 */
export function ExpirySelector({ expiries, selected, onSelect, className }: ExpirySelectorProps) {
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (expiries.length === 0) return;
      let next: number;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        next = (index + 1) % expiries.length;
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        next = (index - 1 + expiries.length) % expiries.length;
      } else if (event.key === 'Home') {
        next = 0;
      } else if (event.key === 'End') {
        next = expiries.length - 1;
      } else {
        return;
      }
      event.preventDefault();
      const target = expiries[next];
      if (!target) return;
      onSelect(target.expiryDate);
      const sibling = event.currentTarget.parentElement?.children[next];
      if (sibling instanceof HTMLElement) sibling.focus();
    },
    [expiries, onSelect],
  );

  return (
    <div
      role="radiogroup"
      aria-label={strings.optionChain.expiryGroup}
      className={cn('flex flex-wrap items-center gap-1', className)}
      data-testid="expiry-selector"
    >
      {expiries.map((expiry, index) => {
        const active = expiry.expiryDate === selected;
        return (
          <button
            key={expiry.expiryDate}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(expiry.expiryDate)}
            onKeyDown={(event) => onKeyDown(event, index)}
            title={`${strings.optionChain.cycleLong[expiry.cycle]} · ${expiry.expiryDate}`}
            data-expiry={expiry.expiryDate}
            className={cn(
              'tnum inline-flex h-7 items-baseline gap-1.5 border px-2 text-xs transition-colors',
              active
                ? 'border-accent bg-accent/10 text-ink'
                : 'border-line text-ink-muted hover:border-line-strong hover:text-ink',
            )}
          >
            <span className="font-medium">{formatIsoDateShort(expiry.expiryDate)}</span>
            <span className={cn('text-2xs', active ? 'text-accent' : 'text-ink-faint')}>
              {strings.optionChain.cycle[expiry.cycle]}
            </span>
            <span className="text-2xs text-ink-faint">
              {strings.optionChain.dte(expiry.daysToExpiry)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
