import { expect, test } from '@playwright/test';

/** The six-index tree and option-chain capability, exactly as specified. */
test('market tree lists NSE/BSE categories and indexes with correct option-chain actions', async ({
  page,
}) => {
  await page.goto('/markets');
  const tree = page.getByTestId('market-tree');
  await expect(tree).toBeVisible();
  for (const label of ['NSE', 'BSE', 'Benchmark', 'Financial', 'Volatility']) {
    await expect(tree.getByText(label, { exact: true }).first()).toBeVisible();
  }
  for (const index of ['NIFTY 50', 'BANK NIFTY', 'FINNIFTY', 'INDIA VIX', 'SENSEX', 'BANKEX']) {
    await expect(tree.getByRole('link', { name: index })).toBeVisible();
  }
});

test.describe('capabilities', () => {
  for (const [path, name] of [
    ['/markets/nse/benchmark/nifty-50', 'NIFTY 50'],
    ['/markets/nse/financial/bank-nifty', 'BANK NIFTY'],
    ['/markets/nse/financial/finnifty', 'FINNIFTY'],
    ['/markets/bse/benchmark/sensex', 'SENSEX'],
    ['/markets/bse/financial/bankex', 'BANKEX'],
  ] as const) {
    test(`${name} exposes an Option Chain action`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { name })).toBeVisible();
      await expect(page.getByRole('link', { name: /option chain/i })).toBeVisible();
    });
  }

  test('INDIA VIX is chart-only and refuses the option-chain URL', async ({ page }) => {
    await page.goto('/markets/nse/volatility/india-vix');
    await expect(page.getByRole('heading', { name: 'INDIA VIX' })).toBeVisible();
    await expect(page.getByRole('link', { name: /option chain/i })).toHaveCount(0);
    await page.goto('/markets/nse/volatility/india-vix/option-chain');
    await expect(page.getByTestId('option-chain-grid')).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex,nofollow',
    );
  });
});
