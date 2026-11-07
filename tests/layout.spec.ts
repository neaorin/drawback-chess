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

for (const [width, height] of [[320, 568], [360, 640], [390, 660], [390, 844], [430, 740], [768, 1024]]) {
  test(`mobile board fills the available width at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(game => {
      localStorage.setItem('drawback-chess-v1', JSON.stringify({
        version: 1, game, mode: 'ai', human: 'w', flipped: false, strength: 200,
      }));
    }, newGame('bridge-over-troubled-water', 'horse'));
    await page.goto('/');
    const board = await page.locator('.board').boundingBox();
    const card = await page.locator('.drawback-card').boundingBox();
    const frame = await page.locator('.board-frame').boundingBox();
    expect(frame!.width).toBeCloseTo(card!.width, 1);
    expect(frame!.x).toBeCloseTo(card!.x, 1);
    expect(Math.abs(board!.width - board!.height)).toBeLessThan(1);
    expect(card!.y).toBeGreaterThan(board!.y + board!.height);
    for (const selector of ['.history-navigation', '.board-toolbar', '.turn-card']) {
      const controls = await page.locator(selector).boundingBox();
      expect(controls!.y).toBeGreaterThanOrEqual(card!.y + card!.height);
    }
    await expect(page.locator('.drawback-content h3')).toHaveText('Bridge Over Troubled Water');
    await expect(page.locator('.drawback-content > p')).toContainText('There is a river');
    await expect(page.locator('.drawback-card .move-info')).toHaveCount(0);
    const piece = await page.locator('.board-piece .piece').first().boundingBox();
    const cell = await page.locator('.square').first().boundingBox();
    expect(piece!.width / cell!.width).toBeCloseTo(.92, 2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const toggle = page.getByRole('switch', { name: 'Dark theme', exact: true });
    const bounds = await toggle.boundingBox();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await toggle.click();
    await expect(toggle).toBeChecked();
    await page.evaluate(() => window.scrollTo(0, 100));
    expect((await page.locator('.board').boundingBox())!.width).toBeCloseTo(board!.width, 1);
    await page.evaluate(() => window.scrollTo(0, 0));
    expect((await page.locator('.board').boundingBox())!.width).toBeCloseTo(board!.width, 1);
    await page.getByRole('button', { name: 'Reveal to opponent', exact: false }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
}

test('mobile board ignores height changes and refits to width changes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const before = await page.locator('.board').boundingBox();
  await page.setViewportSize({ width: 390, height: 600 });
  const after = await page.locator('.board').boundingBox();
  expect(after!.width).toBeCloseTo(before!.width, 1);
  await page.setViewportSize({ width: 430, height: 600 });
  expect((await page.locator('.board').boundingBox())!.width).toBeGreaterThan(before!.width);
});

for (const [width, height] of [[320, 568], [390, 660], [390, 844]]) {
  test(`situational message fits inside the mobile drawback card at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(game => {
      localStorage.setItem('drawback-chess-v1', JSON.stringify({
        version: 1, game, mode: 'local', human: 'w', flipped: false, strength: 200,
      }));
    }, newGame('command', 'horse'));
    await page.goto('/');
    await page.getByRole('button', { name: 'I’m the white player' }).click();
    const card = page.locator('.drawback-card');
    const info = card.getByRole('status', { name: 'Your move restriction' });
    const expectMessageToFit = async () => {
      expect(await info.evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
    };
    await expect(info).toContainText('Cannot capture.');
    await expectMessageToFit();
    const initialBoard = await page.locator('.board').boundingBox();
    const initialCard = await card.boundingBox();
    const expectStableLayout = async () => {
      await expect.poll(async () => (await page.locator('.board').boundingBox())!.width).toBeCloseTo(initialBoard!.width, 1);
      expect((await card.boundingBox())!.height).toBeCloseTo(initialCard!.height, 1);
      expect(await info.evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
    };
    const heading = await card.locator('h3').boundingBox();
    const message = await info.boundingBox();
    const description = await card.locator('.drawback-content > p').boundingBox();
    expect(description!.y).toBeGreaterThanOrEqual(heading!.y + heading!.height);
    expect(message!.y).toBeGreaterThanOrEqual(description!.y + description!.height);

    await page.locator('[data-square="e2"]').click();
    await page.locator('[data-square="e3"]').click();
    await expect(info).toHaveCount(0);
    await page.getByRole('button', { name: 'I’m the black player' }).click();
    await expect(info).toHaveCount(0);
    const noMessageHeading = await card.locator('h3').boundingBox();
    const noMessageDescription = await card.locator('.drawback-content > p').boundingBox();
    expect(noMessageDescription!.y - noMessageHeading!.y - noMessageHeading!.height).toBeLessThan(10);
    await page.locator('[data-square="a7"]').click();
    await page.locator('[data-square="a6"]').click();
    await page.getByRole('button', { name: 'I’m the white player' }).click();
    await expect(info).toContainText('Cannot capture.');
    await expectMessageToFit();
    await expectStableLayout();
    await page.locator('[data-square="e1"]').click();
    await page.locator('[data-square="e2"]').click();
    await page.getByRole('button', { name: 'I’m the black player' }).click();
    await page.locator('[data-square="a6"]').click();
    await page.locator('[data-square="a5"]').click();
    await page.getByRole('button', { name: 'I’m the white player' }).click();
    await expect(info).toContainText('Can capture for the next 3 moves');
    await expectMessageToFit();
    await expectStableLayout();
  });
}

test('mobile reserves message space while reviewing a turn with no restriction', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 660 });
  await page.addInitScript(game => {
    localStorage.setItem('drawback-chess-v1', JSON.stringify({
      version: 1, game, mode: 'ai', human: 'w', flipped: false, strength: 200,
    }));
  }, newGame('command', 'horse'));
  await page.goto('/');
  const info = page.getByRole('status', { name: 'Your move restriction' });
  await expect(info).toContainText('Cannot capture.');
  const board = await page.locator('.board').boundingBox();
  const card = await page.locator('.drawback-card').boundingBox();
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e3"]').click();
  await expect.poll(() => page.locator('.move-pair span').count()).toBeGreaterThanOrEqual(3);
  await expect(page.locator('.turn-card h2')).toHaveText('White to move.');
  await page.getByRole('button', { name: 'Previous position', exact: true }).click();
  await expect(info).toHaveCount(0);
  expect((await page.locator('.board').boundingBox())!.width).toBeCloseTo(board!.width, 1);
  expect((await page.locator('.drawback-card').boundingBox())!.height).toBeCloseTo(card!.height, 1);
});
