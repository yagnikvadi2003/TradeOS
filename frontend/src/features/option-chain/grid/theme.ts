import { themeQuartz } from 'ag-grid-community';

/**
 * Terminal theme for the grid: same graphite surfaces and 1 px rules as the
 * rest of the shell, tabular figures, no rounded chrome. Values mirror the
 * tokens in `styles/globals.css`.
 */
export const optionChainGridTheme = themeQuartz.withParams({
  backgroundColor: '#131820',
  foregroundColor: '#e4e9f1',
  headerBackgroundColor: '#0e1116',
  headerTextColor: '#8a94a6',
  oddRowBackgroundColor: '#131820',
  rowHoverColor: '#1a2029',
  selectedRowBackgroundColor: '#1a2029',
  borderColor: '#222a35',
  columnBorder: { color: '#1a2029' },
  headerColumnBorder: { color: '#222a35' },
  headerColumnBorderHeight: '100%',
  accentColor: '#e8a33d',
  rangeSelectionBorderColor: '#e8a33d',
  fontFamily: 'inherit',
  fontSize: 12,
  headerFontSize: 11,
  headerFontWeight: 500,
  rowHeight: 26,
  headerHeight: 28,
  spacing: 4,
  borderRadius: 0,
  wrapperBorderRadius: 0,
  wrapperBorder: false,
  cellHorizontalPadding: 8,
  valueChangeValueHighlightBackgroundColor: 'rgba(232, 163, 61, 0.28)',
  valueChangeDeltaUpColor: '#2fbf71',
  valueChangeDeltaDownColor: '#e5484d',
});
