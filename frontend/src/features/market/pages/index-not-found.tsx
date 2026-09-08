import { Link } from 'react-router';
import { paths, routeVisibility } from '@/app/router/paths';
import { EmptyState } from '@/components/common/empty-state';
import { Seo } from '@/components/common/seo';
import { Button } from '@/components/ui/button';
import { strings } from '@/lib/strings';

export function IndexNotFound() {
  return (
    <div className="p-4 sm:p-5">
      <Seo
        title={strings.market.notFoundTitle}
        description={strings.market.notFoundBody}
        path={paths.markets}
        visibility={routeVisibility.optionChain}
      />
      <EmptyState
        title={strings.market.notFoundTitle}
        body={strings.market.notFoundBody}
        action={
          <Button asChild variant="outline" size="sm">
            <Link to={paths.markets}>{strings.market.backToMarkets}</Link>
          </Button>
        }
      />
    </div>
  );
}
