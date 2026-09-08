import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useEffect, useRef } from 'react';
import { type Candle } from '@/features/charts/domain';

interface PriceChartProps {
  candles: readonly Candle[];
  decimals: number;
  ariaLabel: string;
  className?: string;
}

/** Reads the terminal tokens so the chart matches the surrounding surfaces. */
function readToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function toSeriesData(candles: readonly Candle[]): CandlestickData<UTCTimestamp>[] {
  return candles.map((c) => ({
    time: c.time as UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));
}

/**
 * Thin imperative wrapper around Lightweight Charts. The chart instance lives
 * for the component lifetime; data updates call `setData` on the existing
 * series instead of recreating the chart. Realtime bars will use
 * `series.update()` in a later phase.
 */
export function PriceChart({ candles, decimals, ariaLabel, className }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const up = readToken('--up', '#2fbf71');
    const down = readToken('--down', '#e5484d');
    const line = readToken('--line', '#222a35');
    const inkMuted = readToken('--ink-muted', '#8a94a6');
    const accent = readToken('--accent', '#e8a33d');

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: inkMuted,
        fontFamily: getComputedStyle(document.body).fontFamily,
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: line, style: 1 },
        horzLines: { color: line, style: 1 },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: accent, width: 1, style: 3, labelBackgroundColor: accent },
        horzLine: { color: accent, width: 1, style: 3, labelBackgroundColor: accent },
      },
      rightPriceScale: { borderColor: line, scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: {
        borderColor: line,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
      },
      localization: {
        priceFormatter: (price: number) =>
          new Intl.NumberFormat('en-IN', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          }).format(price),
      },
      handleScroll: { vertTouchDrag: false },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: up,
      downColor: down,
      borderUpColor: up,
      borderDownColor: down,
      wickUpColor: up,
      wickDownColor: down,
      priceFormat: { type: 'price', precision: decimals, minMove: 10 ** -decimals },
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [decimals]);

  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    series.setData(toSeriesData(candles));
    chart.timeScale().fitContent();
  }, [candles]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      className={className}
      data-testid="price-chart"
    />
  );
}
