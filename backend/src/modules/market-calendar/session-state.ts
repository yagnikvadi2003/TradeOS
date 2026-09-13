import { type ExchangeCode, istIsoDate } from '@/common/market/market-primitives';
import { type CalendarDay } from '@/modules/user-data/user-data.types';

/** Regular NSE/BSE equity-derivatives session, minutes from midnight IST. */
export const SESSION_SCHEDULE: Record<
  ExchangeCode,
  { openMinutes: number; closeMinutes: number; preOpenMinutes: number }
> = {
  NSE: { preOpenMinutes: 9 * 60, openMinutes: 9 * 60 + 15, closeMinutes: 15 * 60 + 30 },
  BSE: { preOpenMinutes: 9 * 60, openMinutes: 9 * 60 + 15, closeMinutes: 15 * 60 + 30 },
};

export type SessionState = 'PRE_OPEN' | 'OPEN' | 'CLOSED' | 'HOLIDAY' | 'SPECIAL_SESSION';
const IST_OFFSET_MIN = 330;

function istMinutes(nowMs: number): number {
  const d = new Date(nowMs + IST_OFFSET_MIN * 60_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
function istWeekday(nowMs: number): number {
  return new Date(nowMs + IST_OFFSET_MIN * 60_000).getUTCDay();
}
function istMidnightMs(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00.000+05:30`);
}

/** Pure: today's state and the next open time, given the loaded calendar rows. */
export function resolveSessionState(
  exchange: ExchangeCode,
  nowMs: number,
  days: readonly CalendarDay[],
): { state: SessionState; isTradingDay: boolean; nextOpenAt: number | null } {
  const today = istIsoDate(nowMs);
  const special = days.find((d) => d.date === today);
  const weekend = istWeekday(nowMs) === 0 || istWeekday(nowMs) === 6;
  const schedule = SESSION_SCHEDULE[exchange];
  const minutes = istMinutes(nowMs);

  const nextOpen = (): number | null => {
    for (let i = 0; i < 14; i += 1) {
      const date = istIsoDate(nowMs + i * 86_400_000);
      const wd = new Date(istMidnightMs(date) + IST_OFFSET_MIN * 60_000).getUTCDay();
      const row = days.find((d) => d.date === date);
      if (row?.kind === 'HOLIDAY' || ((wd === 0 || wd === 6) && row?.kind !== 'SPECIAL_SESSION'))
        continue;
      const open = istMidnightMs(date) + (row?.openMinutes ?? schedule.openMinutes) * 60_000;
      if (open > nowMs) return open;
    }
    return null;
  };

  if (special?.kind === 'HOLIDAY')
    return { state: 'HOLIDAY', isTradingDay: false, nextOpenAt: nextOpen() };
  if (
    special?.kind === 'SPECIAL_SESSION' &&
    special.openMinutes !== null &&
    special.closeMinutes !== null
  ) {
    const inSession = minutes >= special.openMinutes && minutes < special.closeMinutes;
    return {
      state: inSession ? 'SPECIAL_SESSION' : 'CLOSED',
      isTradingDay: true,
      nextOpenAt: inSession ? null : nextOpen(),
    };
  }
  if (weekend) return { state: 'CLOSED', isTradingDay: false, nextOpenAt: nextOpen() };
  if (minutes >= schedule.openMinutes && minutes < schedule.closeMinutes)
    return { state: 'OPEN', isTradingDay: true, nextOpenAt: null };
  if (minutes >= schedule.preOpenMinutes && minutes < schedule.openMinutes)
    return { state: 'PRE_OPEN', isTradingDay: true, nextOpenAt: nextOpen() };
  return { state: 'CLOSED', isTradingDay: true, nextOpenAt: nextOpen() };
}
