import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useMarkNotificationsRead, useNotificationsFeed } from '@/hooks/use-user-data';
import { strings } from '@/lib/strings';
import { cn } from '@/lib/utils';
import { useNotificationsStore } from '@/stores/notifications.store';
import { formatIstTime } from '@/utils/format';

/** Header bell: unread badge, popover inbox, browser-notification opt-in. */
export function NotificationsTray() {
  useNotificationsFeed();
  const unread = useNotificationsStore((s) => s.unread);
  const items = useNotificationsStore((s) => s.items);
  const markRead = useMarkNotificationsRead();
  const [open, setOpen] = useState(false);
  const [browser, setBrowser] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted',
  );
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="relative flex h-7 items-center gap-1 px-1 text-xs text-ink-muted hover:text-ink"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          unread
            ? `${strings.notifications.title}, ${strings.notifications.unread(unread)}`
            : strings.notifications.title
        }
        onClick={() => setOpen((o) => !o)}
        data-testid="notifications-toggle"
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 ? (
          <span className="tnum bg-accent px-1 text-2xs text-surface" data-testid="unread-badge">
            {unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label={strings.notifications.title}
          className="absolute right-0 z-20 mt-1 w-80 border border-line bg-surface shadow-md"
        >
          <div className="flex items-center gap-2 border-b border-line px-2 py-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink">
              {strings.notifications.title}
            </span>
            <div className="ml-auto flex gap-1">
              {!browser && typeof Notification !== 'undefined' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void Notification.requestPermission().then((p) => setBrowser(p === 'granted'))
                  }
                >
                  {strings.notifications.enableBrowser}
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={unread === 0}
                onClick={() => markRead.mutate('all')}
              >
                {strings.notifications.markAll}
              </Button>
            </div>
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-2 py-2 text-xs text-ink-faint">{strings.notifications.empty}</li>
            ) : null}
            {items.map((n) => (
              <li
                key={n.id}
                className={cn(
                  'border-b border-line px-2 py-1 text-xs last:border-b-0',
                  n.readAt === null ? 'bg-surface-raised' : '',
                )}
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-medium text-ink">{n.title}</span>
                  <span className="tnum ml-auto text-2xs text-ink-faint">
                    {formatIstTime(n.createdAt)}
                  </span>
                </div>
                <p className="text-ink-muted">{n.body}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
