import { expect, test } from '@playwright/test';

for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
  test(`desktop board uses available width at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const board = await page.locator('.board').boundingBox();
    const sidebar = await page.locator('.sidebar').boundingBox();
    expect(board!.width).toBeGreaterThan(Math.min(width, 1536) - 470);
    expect(Math.abs(board!.width - board!.height)).toBeLessThan(1);
    expect(sidebar!.x).toBeGreaterThan(board!.x + board!.width);
    expect(sidebar!.x + sidebar!.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}

test('mobile retains a full-width board and stacked sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const board = await page.locator('.board').boundingBox();
  const sidebar = await page.locator('.sidebar').boundingBox();
  expect(board!.width).toBeGreaterThan(330);
  expect(sidebar!.y).toBeGreaterThan(board!.y + board!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
