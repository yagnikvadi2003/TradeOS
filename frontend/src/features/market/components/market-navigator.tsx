import { ChevronDown, ChevronRight } from 'lucide-react';
import { useCallback, useMemo, useRef, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { paths } from '@/app/router/paths';
import { ChangeValue } from '@/components/trading/change-value';
import { marketCatalog } from '@/features/market/config';
import { type IndexQuote, type InstrumentKey, type MarketIndex } from '@/features/market/domain';
import { strings } from '@/lib/strings';
import { cn } from '@/lib/utils';
import { useMarketUiStore } from '@/stores/market-ui.store';

type TreeItem =
  | { kind: 'exchange'; id: string; code: string; label: string; expanded: boolean }
  | { kind: 'index'; id: string; index: MarketIndex };

interface MarketNavigatorProps {
  selectedIndexCode?: string | undefined;
  quotes?: ReadonlyMap<InstrumentKey, IndexQuote> | undefined;
  /** Invoked after navigation (e.g. to close the mobile sheet). */
  onNavigate?: () => void;
  className?: string;
}

/**
 * Exchange → Category → Index tree with a roving tabindex.
 * Exchanges and indexes are focusable tree items; categories are group
 * labels. Arrow keys move, Left/Right collapse/expand, Enter/Space opens.
 */
export function MarketNavigator({
  selectedIndexCode,
  quotes,
  onNavigate,
  className,
}: MarketNavigatorProps) {
  const navigate = useNavigate();
  const collapsed = useMarketUiStore((s) => s.collapsedExchanges);
  const toggleExchange = useMarketUiStore((s) => s.toggleExchange);
  const itemRefs = useRef(new Map<string, HTMLElement>());
  const tree = marketCatalog.tree();

  const visibleItems = useMemo<TreeItem[]>(() => {
    const items: TreeItem[] = [];
    for (const node of tree) {
      const expanded = !collapsed.has(node.exchange.code);
      items.push({
        kind: 'exchange',
        id: `ex:${node.exchange.code}`,
        code: node.exchange.code,
        label: node.exchange.name,
        expanded,
      });
      if (!expanded) continue;
      for (const category of node.categories) {
        for (const index of category.indexes) {
          items.push({ kind: 'index', id: `ix:${index.code}`, index });
        }
      }
    }
    return items;
  }, [tree, collapsed]);

  const activeId = useMemo(() => {
    const selected = visibleItems.find(
      (item) => item.kind === 'index' && item.index.code === selectedIndexCode,
    );
    return selected?.id ?? visibleItems[0]?.id ?? '';
  }, [visibleItems, selectedIndexCode]);

  const open = useCallback(
    (index: MarketIndex) => {
      void navigate(paths.marketIndex(marketCatalog.pathOf(index)));
      onNavigate?.();
    },
    [navigate, onNavigate],
  );

  const focusItem = (id: string) => {
    itemRefs.current.get(id)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const currentId = target.dataset.treeId;
    if (!currentId) return;
    const position = visibleItems.findIndex((item) => item.id === currentId);
    if (position === -1) return;
    const current = visibleItems[position];
    if (!current) return;

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        const next = visibleItems[Math.min(position + 1, visibleItems.length - 1)];
        if (next) focusItem(next.id);
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        const prev = visibleItems[Math.max(position - 1, 0)];
        if (prev) focusItem(prev.id);
        break;
      }
      case 'Home': {
        event.preventDefault();
        const first = visibleItems[0];
        if (first) focusItem(first.id);
        break;
      }
      case 'End': {
        event.preventDefault();
        const last = visibleItems[visibleItems.length - 1];
        if (last) focusItem(last.id);
        break;
      }
      case 'ArrowRight': {
        event.preventDefault();
        if (current.kind === 'exchange' && !current.expanded) toggleExchange(current.code);
        else if (current.kind === 'exchange') {
          const next = visibleItems[position + 1];
          if (next) focusItem(next.id);
        }
        break;
      }
      case 'ArrowLeft': {
        event.preventDefault();
        if (current.kind === 'exchange' && current.expanded) toggleExchange(current.code);
        else if (current.kind === 'index') focusItem(`ex:${current.index.exchangeCode}`);
        break;
      }
      case 'Enter':
      case ' ': {
        event.preventDefault();
        if (current.kind === 'exchange') toggleExchange(current.code);
        else open(current.index);
        break;
      }
      default:
        break;
    }
  };

  const register = (id: string) => (element: HTMLElement | null) => {
    if (element) itemRefs.current.set(id, element);
    else itemRefs.current.delete(id);
  };

  return (
    <nav aria-label={strings.nav.marketTree} className={cn('flex flex-col', className)}>
      <div className="flex items-baseline justify-between px-3 pt-3 pb-2">
        <h2 className="text-sm font-semibold text-ink">{strings.nav.markets}</h2>
        <span className="text-2xs text-ink-faint">
          {strings.nav.indexCount(marketCatalog.indexes().length)}
        </span>
      </div>
      <ul
        role="tree"
        aria-label={strings.nav.marketTree}
        className="flex flex-col"
        onKeyDown={onKeyDown}
      >
        {tree.map((node) => {
          const expanded = !collapsed.has(node.exchange.code);
          const exchangeId = `ex:${node.exchange.code}`;
          return (
            <li
              key={node.exchange.code}
              role="treeitem"
              aria-expanded={expanded}
              aria-selected={false}
              aria-level={1}
            >
              <button
                ref={register(exchangeId)}
                type="button"
                data-tree-id={exchangeId}
                tabIndex={activeId === exchangeId ? 0 : -1}
                onClick={() => toggleExchange(node.exchange.code)}
                className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-xs font-semibold tracking-wide text-ink-muted hover:text-ink"
                title={node.exchange.fullName}
              >
                {expanded ? (
                  <ChevronDown className="size-3.5 text-ink-faint" aria-hidden="true" />
                ) : (
                  <ChevronRight className="size-3.5 text-ink-faint" aria-hidden="true" />
                )}
                <span>{node.exchange.name}</span>
              </button>
              {expanded ? (
                <ul role="group" className="pb-1.5">
                  {node.categories.map((categoryNode) => (
                    <li key={categoryNode.category.code} role="none">
                      <div
                        className="px-3 pt-1.5 pb-0.5 pl-8 text-2xs text-ink-faint"
                        title={categoryNode.category.description}
                        id={`cat-${node.exchange.code}-${categoryNode.category.code}`}
                      >
                        {categoryNode.category.name}
                      </div>
                      <ul
                        role="group"
                        aria-labelledby={`cat-${node.exchange.code}-${categoryNode.category.code}`}
                      >
                        {categoryNode.indexes.map((index) => {
                          const id = `ix:${index.code}`;
                          const selected = index.code === selectedIndexCode;
                          const quote = quotes?.get(index.instrumentKey);
                          return (
                            <li
                              key={index.code}
                              role="treeitem"
                              aria-level={2}
                              aria-selected={selected}
                            >
                              <button
                                ref={register(id)}
                                type="button"
                                data-tree-id={id}
                                data-testid={`nav-${index.slug}`}
                                tabIndex={activeId === id ? 0 : -1}
                                aria-current={selected ? 'page' : undefined}
                                onClick={() => open(index)}
                                className={cn(
                                  'flex w-full items-center gap-2 border-l-2 py-1.5 pr-3 pl-7 text-left text-sm',
                                  selected
                                    ? 'border-accent bg-surface-raised text-ink'
                                    : 'border-transparent text-ink-muted hover:bg-surface-raised/60 hover:text-ink',
                                )}
                              >
                                <span className="min-w-0 flex-1 truncate font-medium">
                                  {index.name}
                                </span>
                                {index.capabilities.hasOptionChain ? (
                                  <span
                                    className="text-2xs text-ink-faint"
                                    title={strings.market.optionChain}
                                    aria-label={strings.market.optionChain}
                                  >
                                    OC
                                  </span>
                                ) : null}
                                {quote ? (
                                  <ChangeValue
                                    change={quote.change}
                                    changePercent={quote.changePercent}
                                    percentOnly
                                    className="text-xs"
                                  />
                                ) : (
                                  <span className="w-12 text-right text-xs text-ink-faint">—</span>
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="mt-auto px-3 py-3 text-2xs text-ink-faint">{strings.nav.keyboardHint}</p>
    </nav>
  );
}
