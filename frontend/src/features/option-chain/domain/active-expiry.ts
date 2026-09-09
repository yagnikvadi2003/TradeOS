import { type Expiry, type IsoDate } from './types';

/** Selected expiry if still listed, else the nearest one; null when nothing is listed. */
export function resolveActiveExpiry(
  expiries: readonly Expiry[],
  selected: IsoDate | null,
): IsoDate | null {
  if (expiries.length === 0) return null;
  return expiries.some((e) => e.expiryDate === selected)
    ? selected
    : (expiries[0]?.expiryDate ?? null);
}
