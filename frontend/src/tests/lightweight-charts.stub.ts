import { vi } from 'vitest';

/**
 * jsdom has no canvas. This stub mirrors the subset of the Lightweight Charts
 * v5 API the app uses so components mount, and exposes spies so tests can
 * assert lifecycle behaviour (one chart per mount, setData on update).
 */
export const chartSpies = {
  createChart: vi.fn(),
  addSeries: vi.fn(),
  setData: vi.fn(),
  update: vi.fn(),
  fitContent: vi.fn(),
  remove: vi.fn(),
};

export function createChartStub() {
  const series = {
    setData: chartSpies.setData,
    update: chartSpies.update,
    applyOptions: vi.fn(),
  };
  const timeScale = { fitContent: chartSpies.fitContent, applyOptions: vi.fn() };
  const chart = {
    addSeries: (...args: unknown[]) => {
      chartSpies.addSeries(...args);
      return series;
    },
    timeScale: () => timeScale,
    applyOptions: vi.fn(),
    remove: chartSpies.remove,
  };
  return (...args: unknown[]) => {
    chartSpies.createChart(...args);
    return chart;
  };
}
