import { paths } from '@/app/router/paths';
import { marketCatalog } from '@/features/market/config';

/**
 * Indexing rules, in one place:
 *  - public: `/`, `/markets` (the exchange → category → index tree) and the six index pages;
 *  - private (noindex, excluded from the sitemap and disallowed in robots.txt):
 *    option-chain screens — they are trading workspaces, never landing pages.
 */
export interface SitemapEntry {
  readonly path: string;
  readonly changefreq: 'daily' | 'weekly';
  readonly priority: number;
}

export function publicSitemapEntries(): SitemapEntry[] {
  const entries: SitemapEntry[] = [
    { path: paths.home, changefreq: 'weekly', priority: 1 },
    { path: paths.markets, changefreq: 'daily', priority: 0.9 },
  ];
  for (const index of marketCatalog.indexes()) {
    entries.push({
      path: paths.marketIndex(marketCatalog.pathOf(index)),
      changefreq: 'daily',
      priority: 0.8,
    });
  }
  return entries;
}

export function privateDisallowPrefixes(): string[] {
  return ['/*/option-chain', '/api/', '/ws/'];
}

export function renderSitemapXml(origin: string, lastmod: string): string {
  const urls = publicSitemapEntries()
    .map(
      (e) =>
        `  <url>\n    <loc>${origin}${e.path}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority.toFixed(1)}</priority>\n  </url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function renderRobotsTxt(origin: string): string {
  const disallow = privateDisallowPrefixes()
    .map((p) => `Disallow: ${p}`)
    .join('\n');
  return `User-agent: *\nAllow: /\n${disallow}\n\nSitemap: ${origin}/sitemap.xml\n`;
}
