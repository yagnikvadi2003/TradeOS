/**
 * Writes public/robots.txt and public/sitemap.xml from the route catalog at
 * build time (`prebuild`). Origin comes from VITE_PUBLIC_ORIGIN.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderRobotsTxt, renderSitemapXml } from '../src/app/seo/sitemap';

const origin = (process.env.VITE_PUBLIC_ORIGIN ?? 'http://localhost:5173').replace(/\/$/, '');
const publicDir = resolve(process.cwd(), 'public');
mkdirSync(publicDir, { recursive: true });
writeFileSync(resolve(publicDir, 'robots.txt'), renderRobotsTxt(origin));
writeFileSync(
  resolve(publicDir, 'sitemap.xml'),
  renderSitemapXml(origin, new Date().toISOString().slice(0, 10)),
);
console.log(`SEO assets written for ${origin}`);
