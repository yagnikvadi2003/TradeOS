import { describe, expect, it } from 'vitest';
import {
  decimalsForTick,
  formatChange,
  formatLevel,
  formatMinutesOfDay,
  formatPercent,
} from './format';

describe('format', () => {
  it('uses Indian digit grouping for levels', () => {
    expect(formatLevel(2451235.5)).toBe('24,51,235.50');
    expect(formatLevel(14.1275, 4)).toBe('14.1275');
  });

  it('formats signed change and percent', () => {
    expect(formatChange(112.4)).toBe('+112.40');
    expect(formatChange(-3)).toBe('−3.00');
    expect(formatChange(0)).toBe('0.00');
    expect(formatPercent(0.46)).toBe('+0.46%');
    expect(formatPercent(-1.2)).toBe('−1.20%');
  });

  it('derives display decimals from tick size', () => {
    expect(decimalsForTick(0.05)).toBe(2);
    expect(decimalsForTick(0.0025)).toBe(4);
    expect(decimalsForTick(1)).toBe(0);
    expect(decimalsForTick(0)).toBe(2);
  });

  it('formats minutes of day', () => {
    expect(formatMinutesOfDay(9 * 60 + 15)).toBe('09:15');
  });

  it('never throws on non-finite input', () => {
    expect(formatLevel(Number.NaN)).toBe('—');
    expect(formatChange(Number.POSITIVE_INFINITY)).toBe('—');
  });
});
