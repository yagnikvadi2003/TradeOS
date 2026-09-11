import { defineConfig, devices } from '@playwright/test';

/**
 * E2E against the production build served by `vite preview`, with the
 * backend on :3000 in mock mode (deterministic data, real WebSocket path).
 * `pnpm test:e2e` from the repo root starts both.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command:
            'cd ../backend && PORT=3000 MARKET_DATA_PROVIDER=mock LOG_LEVEL=warn CORS_ORIGINS=http://127.0.0.1:4173,http://localhost:4173 node dist/main.js',
          url: 'http://127.0.0.1:3000/health/ready',
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
        },
        {
          // Serves the existing production build (built with VITE_E2E_HOOKS=true by `pnpm test:e2e`).
          command: 'pnpm exec vite preview --host 127.0.0.1 --port 4173',
          url: 'http://127.0.0.1:4173',
          reuseExistingServer: !process.env.CI,
          timeout: 30_000,
        },
      ],
});
