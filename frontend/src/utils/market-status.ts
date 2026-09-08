import {
  type MarketPhase,
  type MarketSessionSchedule,
  type MarketStatus,
} from '@/features/market/domain';

const IST_OFFSET_MINUTES = 5 * 60 + 30;
const MINUTES_PER_DAY = 24 * 60;

interface IstClock {
  /** ISO weekday, 1 = Monday … 7 = Sunday. */
  readonly isoWeekday: number;
  /** Minutes since midnight IST. */
  readonly minutesOfDay: number;
  /** Epoch ms of midnight IST for the current IST date. */
  readonly midnightEpochMs: number;
}

/**
 * IST is UTC+05:30 with no daylight saving, so the conversion is a fixed
 * offset. This avoids Intl parsing on every evaluation.
 */
export function istClock(epochMs: number): IstClock {
  const shifted = epochMs + IST_OFFSET_MINUTES * 60_000;
  const dayMs = 86_400_000;
  const dayIndex = Math.floor(shifted / dayMs);
  const minutesOfDay = Math.floor((shifted - dayIndex * dayMs) / 60_000);
  // 1970-01-01 was a Thursday (ISO weekday 4).
  const isoWeekday = ((dayIndex + 3) % 7) + 1;
  const midnightEpochMs = dayIndex * dayMs - IST_OFFSET_MINUTES * 60_000;
  return { isoWeekday, minutesOfDay, midnightEpochMs };
}

function inWindow(minutes: number, start: number, end: number): boolean {
  return minutes >= start && minutes < end;
}

function nextTradingDayMidnight(clock: IstClock, tradingWeekdays: readonly number[]): number {
  for (let offset = 1; offset <= 7; offset += 1) {
    const weekday = ((clock.isoWeekday - 1 + offset) % 7) + 1;
    if (tradingWeekdays.includes(weekday)) {
      return clock.midnightEpochMs + offset * 86_400_000;
    }
  }
  return clock.midnightEpochMs + 86_400_000;
}

/**
 * Evaluate the exchange phase for a point in time using the regular session
 * schedule. Pure and deterministic — holidays are not modelled in phase 1.
 */
export function evaluateMarketStatus(
  schedule: MarketSessionSchedule,
  epochMs: number = Date.now(),
): MarketStatus {
  const clock = istClock(epochMs);
  const isTradingDay = schedule.tradingWeekdays.includes(clock.isoWeekday);
  const minuteMs = 60_000;
  const at = (minutes: number) => clock.midnightEpochMs + minutes * minuteMs;

  if (!isTradingDay) {
    const nextMidnight = nextTradingDayMidnight(clock, schedule.tradingWeekdays);
    return {
      exchangeCode: schedule.exchangeCode,
      phase: 'CLOSED',
      asOf: epochMs,
      nextTransitionAt: nextMidnight + schedule.preOpen.startMinutes * minuteMs,
      isTradingDay: false,
    };
  }

  const m = clock.minutesOfDay;
  let phase: MarketPhase;
  let nextTransitionAt: number;

  if (inWindow(m, schedule.preOpen.startMinutes, schedule.preOpen.endMinutes)) {
    phase = 'PRE_OPEN';
    nextTransitionAt = at(schedule.regular.startMinutes);
  } else if (inWindow(m, schedule.regular.startMinutes, schedule.regular.endMinutes)) {
    phase = 'OPEN';
    nextTransitionAt = at(schedule.regular.endMinutes);
  } else if (inWindow(m, schedule.postClose.startMinutes, schedule.postClose.endMinutes)) {
    phase = 'POST_CLOSE';
    nextTransitionAt = at(schedule.postClose.endMinutes);
  } else if (m < schedule.preOpen.startMinutes) {
    phase = 'CLOSED';
    nextTransitionAt = at(schedule.preOpen.startMinutes);
  } else if (m >= schedule.regular.endMinutes && m < schedule.postClose.startMinutes) {
    // Closing-price computation window between regular close and post-close.
    phase = 'CLOSED';
    nextTransitionAt = at(schedule.postClose.startMinutes);
  } else {
    phase = 'CLOSED';
    const nextMidnight = nextTradingDayMidnight(clock, schedule.tradingWeekdays);
    nextTransitionAt = nextMidnight + schedule.preOpen.startMinutes * minuteMs;
  }

  return {
    exchangeCode: schedule.exchangeCode,
    phase,
    asOf: epochMs,
    nextTransitionAt,
    isTradingDay,
  };
}

export { MINUTES_PER_DAY };
