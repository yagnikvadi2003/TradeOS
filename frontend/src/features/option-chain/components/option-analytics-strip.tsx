import { memo } from 'react';
import { type OptionAnalytics } from '@/features/option-chain/domain';
import { strings } from '@/lib/strings';
import { cn } from '@/lib/utils';
import { formatLevel } from '@/utils/format';

interface OptionAnalyticsStripProps {
  analytics: OptionAnalytics;
  className?: string;
}

function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex items-baseline gap-1.5" title={title}>
      <dt className="text-2xs uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="tnum text-xs text-ink">{value}</dd>
    </div>
  );
}

const fmt = (v: number | null, d = 2) => (v === null ? '—' : v.toFixed(d));
const levels = (xs: readonly number[], d: number) =>
  xs.length ? xs.map((x) => formatLevel(x, d)).join(' · ') : '—';

/**
 * One quiet row of TradeOS-derived numbers. Labelled "Derived" so nobody
 * mistakes max pain or PCR for something the exchange published.
 */
export const OptionAnalyticsStrip = memo(function OptionAnalyticsStrip({
  analytics: a,
  className,
}: OptionAnalyticsStripProps) {
  const t = strings.optionChain.analytics;
  return (
    <dl
      className={cn('flex flex-wrap items-center gap-x-5 gap-y-1', className)}
      aria-label={t.label}
      data-testid="option-analytics"
      data-derived="true"
    >
      <span
        className="border border-line px-1 text-2xs uppercase tracking-wide text-ink-faint"
        title={t.hint}
      >
        {t.label}
      </span>
      <Stat label={t.oiPcr} value={fmt(a.oiPcr)} />
      <Stat label={t.volumePcr} value={fmt(a.volumePcr)} />
      <Stat label={t.maxPain} value={a.maxPain === null ? '—' : formatLevel(a.maxPain, 0)} />
      <Stat label={t.atmIv} value={a.atmIv === null ? '—' : `${a.atmIv.toFixed(2)}%`} />
      <Stat label={t.support} value={levels(a.supportCandidates, 0)} title={`${t.oiTop} PE`} />
      <Stat
        label={t.resistance}
        value={levels(a.resistanceCandidates, 0)}
        title={`${t.oiTop} CE`}
      />
      <Stat
        label={t.oiChangeTop}
        value={[a.oiChangeConcentration.ce[0], a.oiChangeConcentration.pe[0]]
          .map((w) =>
            w
              ? `${formatLevel(w.strike, 0)} ${w.value >= 0 ? '+' : ''}${Math.round(w.value / 1000)}k`
              : '—',
          )
          .join(' / ')}
        title="Largest ΔOI: CE / PE"
      />
    </dl>
  );
});
