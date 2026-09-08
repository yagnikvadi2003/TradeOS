import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { createChartStub } from './lightweight-charts.stub';

afterEach(() => {
  cleanup();
});

vi.mock('lightweight-charts', () => ({
  createChart: createChartStub(),
  CandlestickSeries: { type: 'Candlestick' },
  ColorType: { Solid: 'solid' },
  CrosshairMode: { Normal: 0, Magnet: 1 },
}));

// jsdom lacks ResizeObserver, which Radix relies on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

// Radix Dialog calls these on pointer interactions.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
