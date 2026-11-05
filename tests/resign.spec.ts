import { expect, test } from '@playwright/test';
import { DRAWBACKS, newGame } from '../src/game';
import { difficultyLevel } from '../src/drawback-catalogue';

for (const mode of ['ai', 'local']) {
  test(`resignation confirms, reveals secrets and persists in ${mode} play`, async ({ page }) => {
    const game = newGame('horse', 'cess', 42);
    await page.addInitScript(({ game, mode }) => {
      if (!localStorage.getItem('resign-seeded')) {
        localStorage.setItem('drawback-chess-v1', JSON.stringify({
          version: 1, game, mode, human: 'w', flipped: false, strength: 200,
        }));
        localStorage.setItem('resign-seeded', 'true');
      }
    }, { game, mode });
    await page.goto('/');
    if (mode === 'local') {
      await expect(page.getByRole('button', { name: 'Resign', exact: true })).toBeDisabled();
      await page.getByRole('button', { name: /I’m the .* player/ }).click();
    }
    await page.getByRole('button', { name: 'Resign', exact: true }).click();
    await page.getByRole('button', { name: 'Keep playing' }).click();
    await expect(page.locator('.turn-card h2')).toHaveText('White to move.');
    await page.getByRole('button', { name: 'Resign', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm resignation' }).click();
    const result = page.getByRole('dialog');
    await expect(result.getByRole('heading', { name: 'Black wins', exact: true })).toBeVisible();
    await expect(result).toContainText('White resigned');
    for (const [color, id] of [['White', 'horse'], ['Black', 'cess']] as const) {
      const drawback = DRAWBACKS.find(d => d.id === id)!;
      const section = result.getByRole('region', { name: `${color} drawback`, exact: true });
      await expect(section).toContainText(drawback.name);
      await expect(section).not.toContainText('/100');
      await expect(section.locator('h3 .difficulty-badge')).toHaveText(`■ ${difficultyLevel(drawback.difficulty).label}`);
      const king = section.getByRole('img', { name: `${color} king`, exact: true });
      await expect(king).toBeVisible();
      await expect(king.locator('img')).toHaveAttribute('src', new RegExp(`${color === 'White' ? 'w' : 'b'}K\\.svg$`));
      await expect(section.locator('h3')).not.toContainText(color);
      const iconBox = await king.boundingBox();
      const nameBox = await section.locator('.result-drawback-name').boundingBox();
      const badgeBox = await section.locator('.difficulty-badge').boundingBox();
      expect(Math.abs(iconBox!.y + iconBox!.height / 2 - nameBox!.y - nameBox!.height / 2)).toBeLessThan(1);
      expect(Math.abs(iconBox!.y + iconBox!.height / 2 - badgeBox!.y - badgeBox!.height / 2)).toBeLessThan(1);
    }
    await result.getByRole('button', { name: 'Review board', exact: true }).click();
    await expect(result).toHaveCount(0);
    await expect(page.locator('.turn-card h2')).toHaveText('Black wins');
    await expect(page.locator('.turn-card')).toContainText('White resigned');
    await expect(page.locator('.opponent-card')).toContainText('Cess');
    await expect(page.getByRole('button', { name: 'Resign', exact: true })).toHaveCount(0);
    await page.reload();
    if (mode === 'local') await page.getByRole('button', { name: /I’m the .* player/ }).click();
    await expect(page.locator('.turn-card h2')).toHaveText('Black wins');
    await expect(page.locator('.turn-card')).toContainText('White resigned');
  });
}

test('resigning during computer thinking cancels its pending move', async ({ page }) => {
  const game = newGame('horse', 'cess', 42);
  game.turn = 'b';
  await page.addInitScript(game => {
    localStorage.setItem('drawback-chess-v1', JSON.stringify({
      version: 1, game, mode: 'ai', human: 'w', flipped: false, strength: 900,
    }));
  }, game);
  await page.route('**/engine/stockfish.js', async route => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    await route.abort();
  });
  await page.goto('/');
  await expect(page.locator('.engine-note')).toContainText('thinking');
  await page.getByRole('button', { name: 'Resign', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm resignation' }).click();
  await expect(page.locator('.turn-card')).toContainText('White resigned');
  await page.waitForTimeout(1700);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('drawback-chess-v1')!));
  expect(saved.game.result).toEqual({ winner: 'b', reason: 'White resigned' });
  expect(saved.game.history).toHaveLength(0);
});
