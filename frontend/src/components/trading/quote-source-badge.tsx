import { Badge } from '@/components/ui/badge';
import { type QuoteSource } from '@/features/market/domain';
import { strings } from '@/lib/strings';

export function QuoteSourceBadge({ source }: { source: QuoteSource }) {
  const label = strings.quote.source[source];
  if (source === 'simulated') {
    return (
      <Badge variant="warn" title={strings.quote.simulatedHint}>
        {label}
      </Badge>
    );
  }
  return <Badge variant={source === 'live' ? 'up' : 'neutral'}>{label}</Badge>;
}
