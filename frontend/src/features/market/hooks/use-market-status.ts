import { useEffect, useState } from 'react';
import { marketCatalog } from '@/features/market/config';
import { type ExchangeCode, type MarketStatus } from '@/features/market/domain';
import { evaluateMarketStatus } from '@/utils/market-status';

const REEVALUATE_MS = 30_000;

/**
 * Derived exchange phase. Re-evaluates on a coarse timer and exactly at the
 * next scheduled transition so the badge flips at 09:15/15:30 without a
 * per-second render.
 */
export function useMarketStatus(exchange: ExchangeCode): MarketStatus {
  const schedule = marketCatalog.sessionOf(exchange);
  const [status, setStatus] = useState<MarketStatus>(() => evaluateMarketStatus(schedule));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const next = evaluateMarketStatus(schedule);
      setStatus((prev) =>
        prev.phase === next.phase && prev.nextTransitionAt === next.nextTransitionAt ? prev : next,
      );
      const untilTransition =
        next.nextTransitionAt === null ? REEVALUATE_MS : next.nextTransitionAt - next.asOf + 500;
      timer = setTimeout(tick, Math.max(1_000, Math.min(untilTransition, REEVALUATE_MS)));
    };
    tick();
    return () => clearTimeout(timer);
  }, [schedule]);

  return status;
}
