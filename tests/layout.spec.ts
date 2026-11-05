import { expect, test } from '@playwright/test';
import { newGame } from '../src/game';

test('theme toggle persists without changing the board or game', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const game = await page.evaluate(() => localStorage.getItem('drawback-chess-v1'));
  const toggle = page.getByRole('switch', { name: 'Dark theme', exact: true });
  await expect(page.locator('.site-header').getByRole('switch')).toHaveCount(1);
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('[data-square="a1"]')).toHaveCSS('background-color', 'rgb(145, 145, 145)');
  expect(await page.evaluate(() => localStorage.getItem('drawback-chess-v1'))).toBe(game);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await toggle.press('Space');
  await expect(toggle).not.toBeChecked();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.goto('/?scoutTheme=dark');
  await toggle.click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('square colors stay consistent across themes and board orientations', async ({ page }) => {
  await page.addInitScript(game => {
    localStorage.setItem('drawback-chess-v1', JSON.stringify({
      version: 1, game, mode: 'ai', human: 'w', flipped: false, strength: 200,
    }));
  }, newGame('horse', 'horse'));
  for (const theme of ['light', 'dark']) {
    await page.goto(`/?scoutTheme=${theme}`);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    for (let orientation = 0; orientation < 2; orientation++) {
      const cells = await page.locator('.square').evaluateAll(squares => squares.map(cell => ({
        square: cell.getAttribute('data-square')!,
        background: getComputedStyle(cell).backgroundColor,
        label: getComputedStyle(cell).color,
      })));
      expect(cells).toHaveLength(64);
      for (const cell of cells) {
        const dark = (cell.square.charCodeAt(0) - 97 + Number(cell.square[1])) % 2 === 1;
        expect(cell.background, `${theme} ${cell.square}`).toBe(dark ? 'rgb(145, 145, 145)' : 'rgb(247, 244, 239)');
        expect(cell.label).toBe(dark ? 'rgb(255, 255, 255)' : 'rgb(111, 111, 111)');
      }
      if (orientation === 0) await page.getByRole('button', { name: 'Flip board', exact: true }).click();
    }
  }
});

for (const [width, height] of [[1024, 600], [1280, 720], [1440, 900], [1920, 1080]]) {
  test(`desktop board fits the viewport at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect.poll(async () => {
      const column = await page.locator('.board-column').boundingBox();
      return column!.y + column!.height;
    }).toBeLessThanOrEqual(height - 15);
    const board = await page.locator('.board').boundingBox();
    const sidebar = await page.locator('.sidebar').boundingBox();
    const column = await page.locator('.board-column').boundingBox();
    expect(column!.y + column!.height).toBeLessThanOrEqual(height - 15);
    expect(board!.width).toBeGreaterThan(height - 460);
    expect(Math.abs(board!.width - board!.height)).toBeLessThan(1);
    expect(sidebar!.x).toBeGreaterThan(board!.x + board!.width);
    expect(sidebar!.x + sidebar!.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const piece = await page.locator('.board-piece .piece').first().boundingBox();
    const cell = await page.locator('.square').first().boundingBox();
    expect(piece!.width / cell!.width).toBeCloseTo(.92, 2);
    expect(piece!.height / cell!.height).toBeCloseTo(.92, 2);
  });
}

test('board refits after resizing the window', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const before = await page.locator('.board').boundingBox();
  await page.setViewportSize({ width: 1440, height: 700 });
  await expect.poll(async () => {
    const column = await page.locator('.board-column').boundingBox();
    return column!.y + column!.height;
  }).toBeLessThanOrEqual(685);
  const after = await page.locator('.board').boundingBox();
  expect(after!.width).toBeLessThan(before!.width);
});

test('mobile retains a full-width board and stacked sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const board = await page.locator('.board').boundingBox();
  const sidebar = await page.locator('.sidebar').boundingBox();
  expect(board!.width).toBeGreaterThan(330);
  expect(sidebar!.y).toBeGreaterThan(board!.y + board!.height);
  const piece = await page.locator('.board-piece .piece').first().boundingBox();
  const cell = await page.locator('.square').first().boundingBox();
  expect(piece!.width / cell!.width).toBeCloseTo(.92, 2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const toggle = page.getByRole('switch', { name: 'Dark theme', exact: true });
  await expect(toggle).toBeVisible();
  const bounds = await toggle.boundingBox();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await toggle.click();
  await expect(toggle).toBeChecked();
});
