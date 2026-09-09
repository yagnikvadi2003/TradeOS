import { MarketStatusBadge } from '@/components/trading/market-status-badge';
import { type ExchangeCode } from '@/features/market/domain';
import { useMarketStatus } from '@/features/market/hooks/use-market-status';

/** Session phase for the chain's exchange; re-evaluates only on phase transitions. */
export function MarketStatus({
  exchangeCode,
  className,
}: {
  exchangeCode: ExchangeCode;
  className?: string;
}) {
  const status = useMarketStatus(exchangeCode);
  return <MarketStatusBadge status={status} withNext {...(className ? { className } : {})} />;
}
