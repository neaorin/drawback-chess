import { expect, test } from '@playwright/test';
import { index, newGame } from '../src/game';

for (const winning of [false, true]) {
  test(`${winning ? 'king capture' : 'capture'} plays its distinct sound exactly once`, async ({ page }) => {
    await page.addInitScript(() => {
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (when?: number) {
        document.documentElement.dataset.soundCount = String(Number(document.documentElement.dataset.soundCount ?? 0) + 1);
        document.documentElement.dataset.soundDuration = String(this.buffer?.duration);
        start.call(this, when);
      };
    });
    const game = newGame('horse', 'horse', 42);
    game.board.fill(null);
    game.board[index('a1')] = { color: 'w', kind: 'k' };
    game.board[index('e2')] = { color: 'w', kind: 'r' };
    game.board[index('a8')] = { color: 'b', kind: 'k' };
    game.board[index('e7')] = { color: 'b', kind: winning ? 'k' : 'p' };
    if (winning) game.board[index('a8')] = null;
    await page.goto('/');
    await page.evaluate(game => localStorage.setItem('drawback-chess-v1', JSON.stringify({
      version: 1, game, mode: 'local', human: 'w', flipped: false, strength: 200,
    })), game);
    await page.reload();
    await page.getByRole('button', { name: /I’m the .* player/ }).click();
    await page.locator('[data-square="e2"]').click();
    await page.locator('[data-square="e7"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-sound-count', '1');
    await expect(page.locator('html')).toHaveAttribute('data-sound-duration', winning ? '0.9' : '0.24');
    if (!winning) await page.getByRole('button', { name: /I’m the .* player/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-sound-count', '1');
  });
}

test('move sound toggle is icon-only, persists, and suppresses muted and history sounds', async ({ page }) => {
  await page.addInitScript(() => {
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (when?: number) {
      document.documentElement.dataset.soundCount = String(Number(document.documentElement.dataset.soundCount ?? 0) + 1);
      start.call(this, when);
    };
  });
  await page.goto('/');
  await page.evaluate(game => localStorage.setItem('drawback-chess-v1', JSON.stringify({
    version: 1, game, mode: 'local', human: 'w', flipped: false, strength: 200,
  })), newGame('horse', 'horse', 42));
  await page.reload();
  const toggle = page.getByRole('button', { name: 'Move sounds', exact: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toHaveText('');
  await expect(toggle.locator('svg')).toHaveCount(1);
  await expect(page.locator('.header-settings').getByRole('switch', { name: 'Dark theme' })).toBeVisible();
  await page.getByRole('button', { name: /I’m the .* player/ }).click();
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-sound-count', '1');
  await page.getByRole('button', { name: /I’m the .* player/ }).click();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.locator('[data-square="e7"]').click();
  await page.locator('[data-square="e5"]').click();
  await page.getByRole('button', { name: /I’m the .* player/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-sound-count', '1');
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: /I’m the .* player/ }).click();
  await toggle.click();
  await page.locator('[data-square="g1"]').click();
  await page.locator('[data-square="f3"]').click();
  await page.getByRole('button', { name: /I’m the .* player/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-sound-count', '1');
  await page.locator('[data-square="a8"]').focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('html')).toHaveAttribute('data-sound-count', '1');
  await page.setViewportSize({ width: 375, height: 812 });
  const bounds = await page.locator('.header-settings').boundingBox();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
  await expect(toggle).toBeVisible();
});

test('computer replies also play a move sound', async ({ page }) => {
  await page.addInitScript(() => {
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (when?: number) {
      document.documentElement.dataset.soundCount = String(Number(document.documentElement.dataset.soundCount ?? 0) + 1);
      start.call(this, when);
    };
  });
  await page.goto('/');
  await page.evaluate(game => localStorage.setItem('drawback-chess-v1', JSON.stringify({
    version: 1, game, mode: 'ai', human: 'w', flipped: false, strength: 200,
  })), newGame('horse', 'horse', 42));
  await page.reload();
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-sound-count', '2', { timeout: 20000 });
});
