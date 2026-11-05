import { expect, test } from '@playwright/test';
import { newGame } from '../src/game';

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
