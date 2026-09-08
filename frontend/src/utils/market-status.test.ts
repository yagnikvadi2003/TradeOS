import { describe, expect, it } from 'vitest';
import { marketCatalog } from '@/features/market/config';
import { evaluateMarketStatus, istClock } from './market-status';

const schedule = marketCatalog.sessionOf('NSE');

/** Build an epoch for a given IST date/time. */
function ist(year: number, month: number, day: number, hour: number, minute: number): number {
  return Date.UTC(year, month - 1, day, hour, minute) - (5 * 60 + 30) * 60_000;
}

describe('istClock', () => {
  it('converts epoch to IST weekday and minutes', () => {
    const clock = istClock(ist(2026, 9, 8, 9, 15)); // Tuesday
    expect(clock.isoWeekday).toBe(2);
    expect(clock.minutesOfDay).toBe(9 * 60 + 15);
  });
});

describe('evaluateMarketStatus', () => {
  it('is CLOSED before pre-open', () => {
    const s = evaluateMarketStatus(schedule, ist(2026, 9, 8, 8, 59));
    expect(s.phase).toBe('CLOSED');
    expect(s.isTradingDay).toBe(true);
    expect(s.nextTransitionAt).toBe(ist(2026, 9, 8, 9, 0));
  });

  it('is PRE_OPEN between 09:00 and 09:15', () => {
    expect(evaluateMarketStatus(schedule, ist(2026, 9, 8, 9, 5)).phase).toBe('PRE_OPEN');
  });

  it('is OPEN during the regular session and knows when it closes', () => {
    const s = evaluateMarketStatus(schedule, ist(2026, 9, 8, 13, 0));
    expect(s.phase).toBe('OPEN');
    expect(s.nextTransitionAt).toBe(ist(2026, 9, 8, 15, 30));
  });

  it('is CLOSED at exactly 15:30 and POST_CLOSE from 15:40', () => {
    expect(evaluateMarketStatus(schedule, ist(2026, 9, 8, 15, 30)).phase).toBe('CLOSED');
    expect(evaluateMarketStatus(schedule, ist(2026, 9, 8, 15, 45)).phase).toBe('POST_CLOSE');
  });

  it('is CLOSED on weekends and points to Monday pre-open', () => {
    const s = evaluateMarketStatus(schedule, ist(2026, 9, 12, 11, 0)); // Saturday
    expect(s.phase).toBe('CLOSED');
    expect(s.isTradingDay).toBe(false);
    expect(s.nextTransitionAt).toBe(ist(2026, 9, 14, 9, 0));
  });

  it('after post-close, points to the next trading day', () => {
    const s = evaluateMarketStatus(schedule, ist(2026, 9, 11, 18, 0)); // Friday evening
    expect(s.nextTransitionAt).toBe(ist(2026, 9, 14, 9, 0));
  });
});
