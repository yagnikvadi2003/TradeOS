import { describe, expect, it } from 'vitest';
import { publicSitemapEntries, renderRobotsTxt, renderSitemapXml } from './sitemap';

describe('sitemap architecture', () => {
  it('lists every public page once and no option-chain screen', () => {
    const paths = publicSitemapEntries().map((e) => e.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain('/markets/nse/benchmark/nifty-50');
    expect(paths).toContain('/markets/nse/volatility/india-vix');
    expect(paths).toContain('/markets/bse/financial/bankex');
    expect(paths.filter((p) => p.endsWith('/option-chain'))).toHaveLength(0);
    expect(paths).toHaveLength(2 + 6); // home, markets, six indexes
  });

  it('renders valid xml and a robots file that hides private routes', () => {
    const xml = renderSitemapXml('https://tradeos.example', '2026-09-10');
    expect(xml).toContain('<loc>https://tradeos.example/markets/bse/benchmark/sensex</loc>');
    expect(xml.match(/<url>/g)).toHaveLength(8);
    const robots = renderRobotsTxt('https://tradeos.example');
    expect(robots).toContain('Disallow: /*/option-chain');
    expect(robots).toContain('Sitemap: https://tradeos.example/sitemap.xml');
  });
});
