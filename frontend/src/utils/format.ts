/**
 * Number/time formatting for market surfaces. Indian grouping (12,34,567.89)
 * is used for levels; sign-aware formatting for changes.
 */
const INDIA_LOCALE = 'en-IN';

const levelFormatters = new Map<number, Intl.NumberFormat>();

function levelFormatter(decimals: number): Intl.NumberFormat {
  let formatter = levelFormatters.get(decimals);
  if (!formatter) {
    formatter = new Intl.NumberFormat(INDIA_LOCALE, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    levelFormatters.set(decimals, formatter);
  }
  return formatter;
}

/** Display precision derived from tick size (0.05 → 2, 0.0025 → 4, 1 → 0). */
export function decimalsForTick(tickSize: number): number {
  if (!Number.isFinite(tickSize) || tickSize <= 0) return 2;
  const asString = tickSize.toString();
  const dot = asString.indexOf('.');
  return dot === -1 ? 0 : Math.min(asString.length - dot - 1, 6);
}

export function formatLevel(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '—';
  return levelFormatter(decimals).format(value);
}

export function formatChange(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${levelFormatter(decimals).format(Math.abs(value))}`;
}

export function formatPercent(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(decimals)}%`;
}

const timeFormatter = new Intl.DateTimeFormat(INDIA_LOCALE, {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const shortTimeFormatter = new Intl.DateTimeFormat(INDIA_LOCALE, {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat(INDIA_LOCALE, {
  timeZone: 'Asia/Kolkata',
  weekday: 'short',
  day: '2-digit',
  month: 'short',
});

/** `14:32:10` in IST. */
export function formatIstTime(epochMs: number): string {
  return timeFormatter.format(new Date(epochMs));
}

/** `14:32` in IST. */
export function formatIstShortTime(epochMs: number): string {
  return shortTimeFormatter.format(new Date(epochMs));
}

/** `Tue, 08 Sep` in IST. */
export function formatIstDate(epochMs: number): string {
  return dateFormatter.format(new Date(epochMs));
}

/** `09:15` from minutes since midnight. */
export function formatMinutesOfDay(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/** Indian compact notation for volumes/OI: 1,23,45,678 → `1.23Cr`, 4,56,789 → `4.57L`. */
export function formatCompactIndian(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  if (abs >= 1e7) return `${sign}${(abs / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `${sign}${(abs / 1e5).toFixed(2)}L`;
  if (abs >= 1e3) return `${sign}${levelFormatter(0).format(abs)}`;
  return `${sign}${abs.toFixed(0)}`;
}

/** Signed compact notation for OI change. */
export function formatSignedCompactIndian(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  return value > 0 ? `+${formatCompactIndian(value)}` : formatCompactIndian(value);
}

/** `16 Sep` from `YYYY-MM-DD`. */
export function formatIsoDateShort(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return `${d.toString().padStart(2, '0')} ${MONTHS_SHORT[m - 1] ?? ''}`;
}

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
