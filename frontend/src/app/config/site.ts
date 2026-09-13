import { env } from './env';

/** Static site metadata used by SEO components and document head. */
export const siteConfig = {
  name: env.VITE_APP_NAME,
  origin: env.VITE_PUBLIC_ORIGIN,
  version: '0.7.0',
  description:
    'TradeOS — a professional Indian market terminal for NIFTY 50, BANK NIFTY, FINNIFTY, SENSEX, BANKEX and INDIA VIX with live charts and option chains.',
  locale: 'en_IN',
  twitterCard: 'summary_large_image' as const,
  ogImagePath: '/og-image.png',
} as const;
