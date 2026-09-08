import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { type Candle } from '@/features/charts/domain';
import { chartSpies } from '@/tests/lightweight-charts.stub';
import { PriceChart } from './price-chart';

const candlesA: Candle[] = [
  { time: 1_700_000_000, open: 1, high: 2, low: 0.5, close: 1.5 },
  { time: 1_700_000_300, open: 1.5, high: 2.5, low: 1, close: 2 },
];
const candlesB: Candle[] = [
  ...candlesA,
  { time: 1_700_000_600, open: 2, high: 3, low: 1.5, close: 2.5 },
];

describe('PriceChart', () => {
  beforeEach(() => {
    Object.values(chartSpies).forEach((spy) => spy.mockClear());
  });

  it('creates one chart per mount and pushes data with setData', () => {
    const { rerender, unmount } = render(
      <PriceChart candles={candlesA} decimals={2} ariaLabel="NIFTY 50 price chart" />,
    );
    expect(chartSpies.createChart).toHaveBeenCalledTimes(1);
    expect(chartSpies.addSeries).toHaveBeenCalledTimes(1);
    expect(chartSpies.setData).toHaveBeenCalledTimes(1);
    expect(chartSpies.setData.mock.calls[0]?.[0]).toHaveLength(2);

    rerender(<PriceChart candles={candlesB} decimals={2} ariaLabel="NIFTY 50 price chart" />);
    expect(chartSpies.createChart).toHaveBeenCalledTimes(1);
    expect(chartSpies.setData).toHaveBeenCalledTimes(2);
    expect(chartSpies.fitContent).toHaveBeenCalledTimes(2);

    unmount();
    expect(chartSpies.remove).toHaveBeenCalledTimes(1);
  });

  it('recreates the chart only when display precision changes', () => {
    const { rerender } = render(<PriceChart candles={candlesA} decimals={2} ariaLabel="x" />);
    rerender(<PriceChart candles={candlesA} decimals={4} ariaLabel="x" />);
    expect(chartSpies.remove).toHaveBeenCalledTimes(1);
    expect(chartSpies.createChart).toHaveBeenCalledTimes(2);
  });
});
