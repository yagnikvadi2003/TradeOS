import { EmptyState } from '@/components/common/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { strings } from '@/lib/strings';

export function RouteFallback() {
  return (
    <div className="flex flex-col gap-3 p-5" aria-busy="true">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="p-5">
      <EmptyState title={strings.errors.notFoundTitle} body={strings.errors.notFoundBody} />
    </div>
  );
}
