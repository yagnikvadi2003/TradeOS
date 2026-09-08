import { siteConfig } from '@/app/config/site';
import { type RouteVisibility } from '@/app/router/paths';

export interface SeoProps {
  title: string;
  description: string;
  /** Path (no origin) used for the canonical URL. */
  path: string;
  visibility: RouteVisibility;
  type?: 'website' | 'article';
  /** Optional JSON-LD payload rendered as structured data. */
  structuredData?: Record<string, unknown>;
}

/**
 * Document head metadata. React 19 hoists <title>, <meta> and <link> into
 * <head>, so no head-management library is required. Private trading screens
 * are marked noindex and never get canonical/OG discovery metadata.
 */
export function Seo({
  title,
  description,
  path,
  visibility,
  type = 'website',
  structuredData,
}: SeoProps) {
  const fullTitle = title === siteConfig.name ? title : `${title} · ${siteConfig.name}`;
  const canonical = `${siteConfig.origin}${path}`;
  const isPublic = visibility === 'public';

  return (
    <>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={isPublic ? 'index,follow' : 'noindex,nofollow'} />
      {isPublic ? <link rel="canonical" href={canonical} /> : null}
      {isPublic ? (
        <>
          <meta property="og:type" content={type} />
          <meta property="og:site_name" content={siteConfig.name} />
          <meta property="og:title" content={fullTitle} />
          <meta property="og:description" content={description} />
          <meta property="og:url" content={canonical} />
          <meta property="og:locale" content={siteConfig.locale} />
          <meta property="og:image" content={`${siteConfig.origin}${siteConfig.ogImagePath}`} />
          <meta name="twitter:card" content={siteConfig.twitterCard} />
          <meta name="twitter:title" content={fullTitle} />
          <meta name="twitter:description" content={description} />
        </>
      ) : null}
      {isPublic && structuredData ? (
        <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
      ) : null}
    </>
  );
}
