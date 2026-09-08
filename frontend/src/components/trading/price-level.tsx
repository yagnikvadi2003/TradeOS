import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { formatLevel } from '@/utils/format';

interface PriceLevelProps {
  value: number;
  decimals?: number;
  className?: string;
}

/**
 * Renders a level and flashes green/red for one beat when it changes.
 * The flash class is applied via a key-less state toggle so unchanged values
 * never re-trigger it.
 */
export function PriceLevel({ value, decimals = 2, className }: PriceLevelProps) {
  const previous = useRef(value);
  const [flash, setFlash] = useState<'flash-up' | 'flash-down' | null>(null);

  useEffect(() => {
    if (previous.current === value) return;
    setFlash(value > previous.current ? 'flash-up' : 'flash-down');
    previous.current = value;
    const id = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(id);
  }, [value]);

  return (
    <span className={cn('tnum rounded-sm px-0.5 -mx-0.5', flash, className)}>
      {formatLevel(value, decimals)}
    </span>
  );
}
