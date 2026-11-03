import { expect, test } from '@playwright/test';
import { index, newGame, play, type Game } from '../src/game';

function opening(fog = false): Game {
  let g = newGame(fog ? 'fog' : 'horse', 'horse');
  for (const [from, to] of [['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'], ['b8', 'c6']]) {
    g = play(g, { from: index(from), to: index(to) });
  }
  return g;
}
async function seed(page: import('@playwright/test').Page, g: Game) {
  await page.addInitScript(game => {
    if (!localStorage.getItem('drawback-chess-v1')) localStorage.setItem('drawback-chess-v1', JSON.stringify({
      version: 1, game, mode: 'ai', human: 'w', flipped: false, strength: 200,
    }));
  }, g);
  await page.goto('/');
  await expect(page.getByRole('status', { name: 'Displayed position' })).toContainText('Latest position');
  await page.locator('[data-square="a1"]').focus();
}
test('left and right arrows browse positions read-only and preserve the saved live game', async ({ page }) => {
  await seed(page, opening());
  const saved = await page.evaluate(() => localStorage.getItem('drawback-chess-v1'));
  await page.locator('[data-square="f3"]').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('status', { name: 'Displayed position' })).toHaveText('Reviewing 3 / 4');
  await expect(page.locator('[data-square="b8"]')).toHaveAttribute('aria-label', /Black knight/);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-square="g1"]')).toHaveAttribute('aria-label', /White knight/);
  await page.locator('[data-square="d2"]').click();
  await expect(page.locator('.legal-square')).toHaveCount(0);
  await expect(page.locator('[data-square="d2"]')).toHaveAttribute('draggable', 'false');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('status', { name: 'Displayed position' })).toHaveText('Reviewing 0 / 4');
  await expect(page.locator('[data-square="e2"]')).toHaveAttribute('aria-label', /White pawn/);
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('status', { name: 'Displayed position' })).toHaveText('Latest position · 4 plies');
  await expect(page.locator('[data-square="f3"]')).toHaveAttribute('aria-label', /White knight/);
  expect(await page.evaluate(() => localStorage.getItem('drawback-chess-v1'))).toBe(saved);
  await page.locator('[data-square="d2"]').click();
  await expect(page.locator('.legal-square')).toHaveCount(2);
});
test('review survives live AI progress without undoing it, and reload returns to latest', async ({ page }) => {
  let releaseEngine: () => void = () => {};
  const engineGate = new Promise<void>(resolve => { releaseEngine = resolve; });
  await page.route('**/engine/stockfish.js', async route => { await engineGate; await route.continue(); });
  const g = play(opening(), { from: index('f1'), to: index('c4') });
  await seed(page, g);
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('status', { name: 'Displayed position' })).toContainText('Reviewing');
  releaseEngine();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('drawback-chess-v1')!).game.history.length)).toBe(6);
  await expect(page.locator('[data-square="f1"]')).toHaveAttribute('aria-label', /White bishop/);
  await page.getByRole('button', { name: 'Return to latest' }).click();
  await expect(page.locator('[data-square="c4"]')).toHaveAttribute('aria-label', /White bishop/);
  await page.keyboard.press('ArrowLeft');
  await page.reload();
  await expect(page.getByRole('status', { name: 'Displayed position' })).toHaveText('Latest position · 6 plies');
});
test('review uses historical fog and does not intercept modal form controls', async ({ page }) => {
  await seed(page, opening(true));
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('status', { name: 'Displayed position' })).toHaveText('Reviewing 3 / 4');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-square="e5"]')).toHaveClass(/unknown-square/);
  await expect(page.locator('[data-square="e5"] .piece')).toHaveCount(0);
  await expect(page.locator('.move-history')).toContainText('Hidden move');
  await page.getByRole('button', { name: /New game/ }).click();
  await page.getByLabel('Play as').focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('status', { name: 'Displayed position' })).toHaveText('Reviewing 2 / 4');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Return to latest' }).click();
  await expect(page.locator('[data-square="f3"]')).toHaveAttribute('aria-label', /White knight/);
});
test('a finished game can be reviewed and reset without carrying over the review cursor', async ({ page }) => {
  const g = opening();
  g.result = { winner: 'w', reason: 'King captured' };
  await seed(page, g);
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('status', { name: 'Displayed position' })).toHaveText('Reviewing 3 / 4');
  await expect(page.locator('.opponent-card')).toContainText('Horse Tranquilizer');
  await page.getByRole('button', { name: /New game/ }).click();
  await page.getByRole('button', { name: /Let’s play/ }).click();
  await expect(page.getByRole('status', { name: 'Displayed position' })).toHaveText('Latest position · 0 plies');
});
