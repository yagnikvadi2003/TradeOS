import { type Plugin } from 'vite';
import { PRIVATE_PATH_PATTERNS, paths } from '../../src/app/router/paths';
import { marketCatalog } from '../../src/features/market/config/market.catalog';

/**
 * Emits robots.txt and sitemap.xml at build time, derived from the market
 * configuration and route visibility rules — never maintained by hand.
 */
export function seoStaticFilesPlugin(): Plugin {
  let origin = 'http://localhost:5173';

  const publicUrls = (): string[] => [
    paths.markets,
    ...marketCatalog.indexes().map((index) => paths.marketIndex(marketCatalog.pathOf(index))),
  ];

  const sitemap = (): string => {
    const now = new Date().toISOString();
    const urls = publicUrls()
      .map(
        (path) =>
          `  <url>\n    <loc>${origin}${path}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>daily</changefreq>\n  </url>`,
      )
      .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  };

  const robots = (): string => {
    const disallow = PRIVATE_PATH_PATTERNS.map((pattern) => `Disallow: ${pattern}`).join('\n');
    return `User-agent: *\nAllow: /markets\n${disallow}\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`;
  };

  return {
    name: 'tradeos-seo-static-files',
    configResolved(config) {
      const fromEnv: unknown = (config.env as Record<string, unknown>).VITE_PUBLIC_ORIGIN;
      if (typeof fromEnv === 'string' && fromEnv.length > 0) origin = fromEnv.replace(/\/+$/, '');
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/robots.txt') {
          res.setHeader('Content-Type', 'text/plain');
          res.end(robots());
          return;
        }
        if (req.url === '/sitemap.xml') {
          res.setHeader('Content-Type', 'application/xml');
          res.end(sitemap());
          return;
        }
        next();
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots() });
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap() });
    },
  };
}
