import {
  type ExpiryCycle,
  type InstrumentKey,
  type IsoDate,
} from '@/common/market/market-primitives';

export interface Expiry {
  readonly instrumentKey: InstrumentKey;
  readonly expiryDate: IsoDate;
  readonly cycle: ExpiryCycle;
  /** Calendar days from the reference date to expiry (0 on expiry day). */
  readonly daysToExpiry: number;
  readonly isActive: boolean;
}
