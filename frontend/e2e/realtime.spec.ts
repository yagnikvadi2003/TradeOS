import { expect, test } from '@playwright/test';

test('option chain: REST snapshot once, live deltas over WebSocket, no polling', async ({
  page,
}) => {
  const snapshotRequests: string[] = [];
  const wsUrls: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/option-chain/') && req.url().includes('/snapshot'))
      snapshotRequests.push(req.url());
  });
  page.on('websocket', (ws) => wsUrls.push(ws.url()));

  await page.goto('/markets/nse/benchmark/nifty-50/option-chain');
  await expect(page.getByTestId('option-chain-grid')).toBeVisible();
  await expect(page.locator('[data-connection="connected"]')).toBeVisible({ timeout: 10_000 });

  // Watch for 6 s: a poller would issue ≥5 snapshot requests in that window.
  const before = snapshotRequests.length;
  await page.waitForTimeout(6_000);
  expect(snapshotRequests.length - before).toBeLessThanOrEqual(1);
  expect(wsUrls.some((u) => u.endsWith('/ws/market'))).toBe(true);
  expect(wsUrls.every((u) => !u.includes('upstox'))).toBe(true);

  // Live values arrived: the freshness indicator reports a recent age.
  await expect(page.getByTestId('data-freshness')).toHaveAttribute('data-freshness', 'fresh');
});

test('a dropped socket is re-established without a page reload', async ({ page }) => {
  await page.goto('/markets/bse/benchmark/sensex');
  await expect(page.locator('[data-connection="connected"]')).toBeVisible({ timeout: 10_000 });
  const socketOpenedAgain = page.waitForEvent('websocket', { timeout: 15_000 });
  // Close every open client socket from the page context (simulates a network drop).
  await page.evaluate(() => {
    const sockets =
      (window as unknown as { __tradeosSockets?: WebSocket[] }).__tradeosSockets ?? [];
    for (const s of sockets) s.close();
  });
  // The WsMarketStream backs off then reconnects; the indicator passes through reconnecting → connected.
  await socketOpenedAgain;
  await expect(page.locator('[data-connection="connected"]')).toBeVisible({ timeout: 15_000 });
});
