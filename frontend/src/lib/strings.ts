/**
 * Centralized UI copy. Components reference these keys instead of embedding
 * literals so wording stays consistent and can be localized later.
 */
export const strings = {
  app: {
    name: 'TradeOS',
    tagline: 'Indian market terminal',
    skipToContent: 'Skip to content',
  },
  nav: {
    markets: 'Markets',
    openNavigation: 'Open market navigation',
    closeNavigation: 'Close market navigation',
    marketTree: 'Market navigation',
    indexCount: (count: number) => `${count} indexes`,
    keyboardHint: 'Use arrow keys to move, Enter to open',
  },
  market: {
    overviewTitle: 'Indian markets',
    overviewLead:
      'Six index instruments across NSE and BSE. Select an index for its chart, session status and option chain where available.',
    overviewDescription:
      'Live overview of NIFTY 50, BANK NIFTY, FINNIFTY, INDIA VIX, SENSEX and BANKEX with price, change and option-chain availability.',
    columns: {
      index: 'Index',
      last: 'Last',
      change: 'Chg',
      changePercent: 'Chg %',
      open: 'Open',
      high: 'High',
      low: 'Low',
      prevClose: 'Prev close',
      features: 'Features',
    },
    optionChain: 'Option chain',
    optionChainUnavailable: 'No option chain',
    volatilityOnly: 'Volatility index',
    chart: 'Chart',
    lastUpdate: 'Updated',
    previousClose: 'Prev close',
    dayRange: 'Day range',
    open: 'Open',
    high: 'High',
    low: 'Low',
    noQuote: 'No quote',
    notFoundTitle: 'Index not found',
    notFoundBody: 'This market path does not match any supported index. Pick one from the list.',
    backToMarkets: 'Back to markets',
    previousIndex: 'Previous index',
    nextIndex: 'Next index',
    selectIndex: 'Select an index',
    selectIndexBody:
      'Choose an index from the market navigation to view its chart and session data.',
    quoteError: 'Quote unavailable',
    quoteErrorBody:
      'The market data service did not respond. Retry, or check the backend connection.',
    retry: 'Retry',
    sourceLabel: 'Source',
  },
  status: {
    phase: {
      PRE_OPEN: 'Pre-open',
      OPEN: 'Open',
      POST_CLOSE: 'Post-close',
      CLOSED: 'Closed',
      UNKNOWN: 'Unknown',
    },
    sessionHours: 'Regular session 09:15–15:30 IST',
    opensAt: (time: string) => `Opens ${time}`,
    closesAt: (time: string) => `Closes ${time}`,
    nextTradingDay: 'Next session on next trading day',
    istClock: 'IST',
  },
  realtime: {
    label: 'Realtime',
    idle: 'Off',
    connecting: 'Connecting',
    connected: 'Live',
    reconnecting: 'Reconnecting',
    disconnected: 'Disconnected',
    unavailable: 'Not connected',
    unavailableHint: 'Live streaming arrives with the market data gateway in a later phase.',
  },
  quote: {
    source: {
      live: 'Live',
      snapshot: 'Snapshot',
      simulated: 'Simulated',
    },
    simulatedHint: 'Development data only. Not a market feed.',
  },
  chart: {
    title: 'Chart',
    interval: 'Interval',
    intervals: {
      '1m': '1m',
      '5m': '5m',
      '15m': '15m',
      '1h': '1h',
      '4h': '4h',
      '1d': '1D',
    },
    loading: 'Loading chart',
    empty: 'No chart data',
    emptyBody: 'No candles were returned for this interval.',
    error: 'Chart unavailable',
    errorBody: 'Historical candles could not be loaded.',
    ariaLabel: (name: string) => `${name} price chart`,
  },
  optionChain: {
    title: 'Option chain',
    placeholderTitle: 'Option chain is coming in the next phase',
    placeholderBody:
      'This screen will show expiry selection, ATM reference, CE/PE strikes, OI, IV, Greeks and live updates over WebSocket.',
    unavailableTitle: 'No option chain for this index',
    unavailableBody: 'This is a volatility index. It has no listed options.',
    backToIndex: 'Back to index',
  },
  errors: {
    genericTitle: 'Something went wrong',
    genericBody: 'The screen failed to render. Reload to try again.',
    reload: 'Reload',
    notFoundTitle: 'Page not found',
    notFoundBody: 'The address does not match any screen in TradeOS.',
  },
  footer: {
    instruments: (count: number) => `${count} instruments`,
    version: (version: string) => `v${version}`,
    private: 'Private screen',
    public: 'Public page',
  },
} as const;

export type Strings = typeof strings;
