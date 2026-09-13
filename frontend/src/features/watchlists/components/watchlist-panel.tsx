import { type FormEvent, memo, useState } from 'react';
import { Link } from 'react-router';
import { paths } from '@/app/router/paths';
import { Button } from '@/components/ui/button';
import { marketCatalog } from '@/features/market/config';
import { useLiveSubscription } from '@/hooks/use-live-subscription';
import { useWatchlistMutations, useWatchlists } from '@/hooks/use-user-data';
import { strings } from '@/lib/strings';
import { cn } from '@/lib/utils';
import { type Watchlist } from '@/services/api/user-data.schemas';
import { useLiveIndexTick } from '@/stores/market-state.store';
import { decimalsForTick, formatChange, formatLevel, formatPercent } from '@/utils/format';

/** One row: live level for a watchlist entry; subscribes per key, re-renders per key. */
const WatchlistRow = memo(function WatchlistRow({
  instrumentKey,
  onRemove,
  onMove,
  first,
  last,
}: {
  instrumentKey: string;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  first: boolean;
  last: boolean;
}) {
  const tick = useLiveIndexTick(instrumentKey);
  const index = marketCatalog.hasInstrument(instrumentKey)
    ? marketCatalog.indexByInstrumentKey(instrumentKey)
    : null;
  if (!index) return null;
  const decimals = decimalsForTick(marketCatalog.instrumentByKey(index.instrumentKey).tickSize);
  const tone = tick?.change == null ? 'text-ink-muted' : tick.change >= 0 ? 'text-up' : 'text-down';
  return (
    <li
      className="flex items-center gap-2 border-b border-line px-2 py-1 text-xs last:border-b-0"
      data-testid="watchlist-row"
    >
      <Link
        to={paths.marketIndex(marketCatalog.pathOf(index))}
        className="min-w-0 flex-1 truncate font-medium text-ink hover:underline"
      >
        {index.name}
      </Link>
      <span className="tnum text-ink">
        {tick?.ltp != null ? formatLevel(tick.ltp, decimals) : '—'}
      </span>
      <span className={cn('tnum w-24 text-right', tone)}>
        {tick?.change != null
          ? `${formatChange(tick.change, decimals)} ${tick.changePercent != null ? formatPercent(tick.changePercent) : ''}`
          : ''}
      </span>
      <div className="flex gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={strings.watchlists.moveUp}
          disabled={first}
          onClick={() => onMove(-1)}
        >
          ↑
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={strings.watchlists.moveDown}
          disabled={last}
          onClick={() => onMove(1)}
        >
          ↓
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`${strings.watchlists.remove} ${index.name}`}
          onClick={onRemove}
        >
          ×
        </Button>
      </div>
    </li>
  );
});

function WatchlistBlock({ list }: { list: Watchlist }) {
  const m = useWatchlistMutations();
  const keys = list.items.map((i) => i.instrumentKey);
  useLiveSubscription(keys);
  const [adding, setAdding] = useState<string>('');
  const candidates = marketCatalog.indexes().filter((i) => !keys.includes(i.instrumentKey));
  const move = (key: string, dir: -1 | 1) => {
    const idx = keys.indexOf(key);
    const next = [...keys];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap]!, next[idx]!];
    m.reorderItems.mutate({ id: list.id, instrumentKeys: next });
  };
  return (
    <section
      aria-labelledby={`wl-${list.id}`}
      className="border border-line"
      data-testid="watchlist"
    >
      <header className="flex items-center gap-2 border-b border-line bg-surface-raised px-2 py-1">
        <h3 id={`wl-${list.id}`} className="text-xs font-semibold uppercase tracking-wide text-ink">
          {list.name}
        </h3>
        <span className="text-2xs text-ink-faint">{list.items.length}</span>
        <div className="ml-auto flex items-center gap-1">
          <label className="sr-only" htmlFor={`add-${list.id}`}>
            {strings.watchlists.addTo}
          </label>
          <select
            id={`add-${list.id}`}
            className="h-6 border border-line bg-surface px-1 text-xs text-ink"
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
          >
            <option value="">{strings.watchlists.add}…</option>
            {candidates.map((i) => (
              <option key={i.instrumentKey} value={i.instrumentKey}>
                {i.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!adding}
            onClick={() => {
              m.addItem.mutate({ id: list.id, instrumentKey: adding });
              setAdding('');
            }}
          >
            {strings.watchlists.add}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={`${strings.watchlists.delete} ${list.name}`}
            onClick={() => m.remove.mutate(list.id)}
          >
            ×
          </Button>
        </div>
      </header>
      <ul>
        {list.items.map((item, i) => (
          <WatchlistRow
            key={item.instrumentKey}
            instrumentKey={item.instrumentKey}
            first={i === 0}
            last={i === list.items.length - 1}
            onRemove={() => m.removeItem.mutate({ id: list.id, instrumentKey: item.instrumentKey })}
            onMove={(dir) => move(item.instrumentKey, dir)}
          />
        ))}
      </ul>
    </section>
  );
}

export function WatchlistPanel({ className }: { className?: string }) {
  const lists = useWatchlists();
  const m = useWatchlistMutations();
  const [name, setName] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    m.create.mutate(name.trim(), { onSuccess: () => setName('') });
  };
  return (
    <div className={cn('flex flex-col gap-2', className)} data-testid="watchlist-panel">
      <div className="flex items-baseline gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {strings.watchlists.title}
        </h2>
        <span className="text-2xs text-ink-faint">{strings.watchlists.hint}</span>
      </div>
      {lists.data?.map((list) => (
        <WatchlistBlock key={list.id} list={list} />
      ))}
      {lists.isSuccess && lists.data.length === 0 ? (
        <p className="text-xs text-ink-faint">{strings.watchlists.empty}</p>
      ) : null}
      <form onSubmit={submit} className="flex items-center gap-1">
        <label className="sr-only" htmlFor="new-watchlist">
          {strings.watchlists.create}
        </label>
        <input
          id="new-watchlist"
          className="h-7 border border-line bg-surface px-2 text-xs text-ink"
          placeholder={strings.watchlists.namePlaceholder}
          value={name}
          maxLength={64}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={!name.trim() || m.create.isPending}
        >
          {strings.watchlists.create}
        </Button>
      </form>
    </div>
  );
}
