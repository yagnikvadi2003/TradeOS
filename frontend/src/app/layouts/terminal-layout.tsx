import { Menu } from 'lucide-react';
import { useState } from 'react';
import { Link, Outlet, useLocation, useParams } from 'react-router';
import { siteConfig } from '@/app/config/site';
import { paths } from '@/app/router/paths';
import { ErrorBoundary } from '@/components/common/error-boundary';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { ConnectionIndicator } from '@/components/trading/connection-indicator';
import { NotificationsTray } from '@/features/notifications/components/notifications-tray';
import { IstClock } from '@/components/trading/ist-clock';
import { MarketStatusBadge } from '@/components/trading/market-status-badge';
import { IndexTickerStrip } from '@/features/market/components/index-ticker-strip';
import { MarketNavigator } from '@/features/market/components/market-navigator';
import { marketCatalog } from '@/features/market/config';
import { useIndexQuotes } from '@/features/market/hooks/use-index-quotes';
import { useMarketStatus } from '@/features/market/hooks/use-market-status';
import { strings } from '@/lib/strings';

const ALL_KEYS = marketCatalog.indexes().map((index) => index.instrumentKey);

/**
 * Workstation frame: top bar, always-visible ticker strip, left navigator
 * (sheet on small screens), main region, status footer.
 */
export function TerminalLayout() {
  const params = useParams();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const selected = marketCatalog.indexByPath({
    exchange: params.exchange ?? '',
    category: params.category ?? '',
    index: params.index ?? '',
  });
  const quotes = useIndexQuotes(ALL_KEYS);
  const nse = useMarketStatus('NSE');
  const isPrivate = location.pathname.endsWith('/option-chain');

  return (
    <div className="flex h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-accent focus:px-3 focus:py-1 focus:text-accent-foreground"
      >
        {strings.app.skipToContent}
      </a>

      <header className="flex h-10 items-center gap-3 border-b border-line bg-surface px-3 sm:px-4">
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="lg:hidden"
              aria-label={strings.nav.openNavigation}
            >
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent
            title={strings.nav.marketTree}
            description={strings.nav.keyboardHint}
            closeLabel={strings.nav.closeNavigation}
          >
            <MarketNavigator
              selectedIndexCode={selected?.code}
              quotes={quotes.data}
              onNavigate={() => setNavOpen(false)}
              className="h-full pt-6"
            />
          </SheetContent>
        </Sheet>

        <Link to={paths.markets} className="flex items-baseline gap-2">
          <span className="text-sm font-semibold tracking-tight text-ink">{siteConfig.name}</span>
          <span className="hidden text-2xs text-ink-faint md:inline">{strings.app.tagline}</span>
        </Link>

        <span className="mx-1 hidden h-4 w-px bg-line sm:block" aria-hidden="true" />
        <span className="hidden items-center gap-1.5 sm:flex">
          <span className="text-2xs text-ink-faint">NSE</span>
          <MarketStatusBadge status={nse} />
        </span>

        <div className="ml-auto flex items-center gap-4">
          <NotificationsTray />
          <ConnectionIndicator />
          <IstClock />
        </div>
      </header>

      <IndexTickerStrip quotes={quotes.data} selectedIndexCode={selected?.code} />

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 border-r border-line bg-surface lg:flex lg:flex-col">
          <MarketNavigator
            selectedIndexCode={selected?.code}
            quotes={quotes.data}
            className="h-full"
          />
        </aside>
        <main id="main" className="flex min-w-0 flex-1 flex-col overflow-y-auto" tabIndex={-1}>
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      <footer className="flex h-7 items-center gap-4 border-t border-line bg-surface px-3 text-2xs text-ink-faint sm:px-4">
        <span>{strings.footer.instruments(marketCatalog.instruments().length)}</span>
        <span>{isPrivate ? strings.footer.private : strings.footer.public}</span>
        <span className="ml-auto tnum">{strings.footer.version(siteConfig.version)}</span>
      </footer>
    </div>
  );
}
