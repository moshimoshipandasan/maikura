import { test, expect } from '@playwright/test';

test('smoke: lock, hud updates, place/destroy within range, no console errors', async ({ page }) => {
  const consErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consErrors.push(msg.text());
  });

  await page.goto('/?autotest=1&secs=1');

  // Lock pointer by clicking the instructions overlay
  await page.locator('#instructions').click();

  // Crosshair should become visible after lock
  await expect(page.locator('#crosshair')).toBeVisible();

  // HUD should update from placeholder
  await expect(page.locator('#fps')).toHaveText(/FPS: \d+/, { timeout: 10_000 });
  await expect(page.locator('#coords')).toHaveText(/X:-?\d+\.\d\sY:-?\d+\.\d\sZ:-?\d+\.\d/);

  // Place then destroy a block (no exception expected)
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousedown', { button: 2 })));
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousedown', { button: 0 })));

  // Resize window and ensure HUD continues updating without errors
  await page.setViewportSize({ width: 900, height: 700 });
  await expect(page.locator('#fps')).toHaveText(/FPS: \d+/, { timeout: 5_000 });

  // no console errors
  expect(consErrors, consErrors.join('\n')).toHaveLength(0);
});
