import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
  icon?: ReactNode;
}

/** Quiet empty state: a title, one line of direction, an optional action. */
export function EmptyState({ title, body, action, className, icon }: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-start justify-center gap-2 border border-dashed border-line px-5 py-8 text-left',
        className,
      )}
    >
      {icon ? <div className="text-ink-faint [&_svg]:size-5">{icon}</div> : null}
      <p className="text-base font-medium text-ink">{title}</p>
      {body ? <p className="max-w-prose text-sm text-ink-muted">{body}</p> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
