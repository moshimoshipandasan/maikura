import { test, expect } from '@playwright/test';

test('edit stress 100 cycles passes acceptance threshold', async ({ page }) => {
  const url = '/?editstress=100';
  const consErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consErrors.push(msg.text());
  });
  await page.goto(url);
  const el = page.locator('#validation');
  await expect(el).toBeVisible();
  await expect(el).toContainText('EditStress: done', { timeout: 20_000 });
  const text = await el.textContent();
  expect(text || '').toContain('pass=true');
  // ensure no console errors occurred during test
  expect(consErrors, consErrors.join('\n')).toHaveLength(0);
});

