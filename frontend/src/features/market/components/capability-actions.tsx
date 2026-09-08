import { CandlestickChart, Layers } from 'lucide-react';
import { Link } from 'react-router';
import { paths } from '@/app/router/paths';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { marketCatalog } from '@/features/market/config';
import { type MarketIndex } from '@/features/market/domain';
import { strings } from '@/lib/strings';

interface CapabilityActionsProps {
  index: MarketIndex;
  /** Which action is currently active (affects styling only). */
  active: 'chart' | 'option-chain';
}

/**
 * Actions are driven by explicit capability flags. The Option Chain action is
 * rendered only when `capabilities.hasOptionChain` is true — INDIA VIX gets a
 * volatility label instead.
 */
export function CapabilityActions({ index, active }: CapabilityActionsProps) {
  const path = marketCatalog.pathOf(index);
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={index.name}>
      {index.capabilities.hasChart ? (
        <Button
          asChild
          size="sm"
          variant={active === 'chart' ? 'outline' : 'ghost'}
          aria-current={active === 'chart' ? 'page' : undefined}
        >
          <Link to={paths.marketIndex(path)}>
            <CandlestickChart aria-hidden="true" />
            {strings.market.chart}
          </Link>
        </Button>
      ) : null}
      {index.capabilities.hasOptionChain ? (
        <Button
          asChild
          size="sm"
          variant={active === 'option-chain' ? 'outline' : 'ghost'}
          aria-current={active === 'option-chain' ? 'page' : undefined}
          data-testid="option-chain-action"
        >
          <Link to={paths.optionChain(path)}>
            <Layers aria-hidden="true" />
            {strings.market.optionChain}
          </Link>
        </Button>
      ) : (
        <Badge variant="neutral" data-testid="option-chain-unavailable" className="h-7 px-2">
          {index.kind === 'VOLATILITY_INDEX'
            ? strings.market.volatilityOnly
            : strings.market.optionChainUnavailable}
        </Badge>
      )}
    </div>
  );
}
