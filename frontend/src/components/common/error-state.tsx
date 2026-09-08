import { AlertTriangle } from 'lucide-react';
import { type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { strings } from '@/lib/strings';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  title: string;
  body?: string;
  detail?: string | undefined;
  onRetry?: () => void;
  retryLabel?: string;
  action?: ReactNode;
  className?: string;
}

/** Explains what failed and offers a way forward. Never apologetic, never vague. */
export function ErrorState({
  title,
  body,
  detail,
  onRetry,
  retryLabel = strings.market.retry,
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-2 border border-down/40 bg-down/5 px-5 py-6 text-left',
        className,
      )}
    >
      <div className="flex items-center gap-2 text-down">
        <AlertTriangle className="size-4" aria-hidden="true" />
        <p className="text-base font-medium text-ink">{title}</p>
      </div>
      {body ? <p className="max-w-prose text-sm text-ink-muted">{body}</p> : null}
      {detail ? <p className="max-w-prose text-xs text-ink-faint tnum">{detail}</p> : null}
      <div className="flex gap-2 pt-1">
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            {retryLabel}
          </Button>
        ) : null}
        {action}
      </div>
    </div>
  );
}
