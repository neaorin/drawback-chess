import { expect, test, type Page } from '@playwright/test';
import { DRAWBACKS, index, newGame, play, type Game, type Piece } from '../src/game';

async function loadFog(page: Page, game: Game, mode = 'local', human = 'w') {
  await page.addInitScript(({ game, mode, human }) => {
    if (!localStorage.getItem('drawback-chess-v1')) {
      localStorage.setItem('drawback-chess-v1', JSON.stringify({
        version: 1, game, mode, human, flipped: human === 'b', strength: 200,
      }));
    }
  }, { game, mode, human });
  await page.goto('/');
  if (mode === 'local') await page.getByRole('button', { name: /I’m the .* player/ }).click();
}
function position(extra: Record<string, Piece> = {}): Game {
  const g = newGame('fog', 'horse');
  g.board.fill(null);
  g.rights = { w: { king: false, queen: false }, b: { king: false, queen: false } };
  const pieces: Record<string, Piece> = {
    a1: { color: 'w', kind: 'k' }, e2: { color: 'w', kind: 'p' },
    e3: { color: 'b', kind: 'q' }, a8: { color: 'b', kind: 'r' },
    h8: { color: 'b', kind: 'k' }, ...extra,
  };
  for (const [at, p] of Object.entries(pieces)) g.board[index(at)] = p;
  return g;
}

test('fog hides pieces and labels, while pawn blockers show only an unknown occupant', async ({ page }) => {
  await loadFog(page, position());
  const blocker = page.locator('[data-square="e3"]');
  await expect(blocker).toHaveAttribute('aria-label', 'e3 occupied by an unknown enemy piece; pawn blocked');
  await expect(blocker.locator('.unknown-occupant')).toHaveText('?');
  await expect(blocker.locator('.piece')).toHaveCount(0);
  await expect(page.locator('[data-square="a8"]')).toHaveAttribute('aria-label', 'a8 fog of war');
  await expect(page.locator('[data-square="a8"] .piece')).toHaveCount(0);
  await expect(page.locator('.board .black-piece')).toHaveCount(0);
  await expect(page.locator('.king-under-attack')).toHaveCount(0);
  await expect(page.locator('[data-square="a1"]')).not.toHaveAttribute('aria-label', /under attack/);
  await page.locator('[data-square="e2"]').click();
  await expect(blocker).not.toHaveClass(/legal-square/);
  await blocker.click();
  await expect(page.locator('[data-square="e2"]')).toHaveAttribute('aria-label', /White pawn/);
  await expect(page.locator('.move-pair')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Fog captured icons follow the viewer, history, reload and handoff without exposing enemy captures', async ({ page }) => {
  let game = newGame('fog', 'fog', 42);
  for (const [from, to] of [['e2', 'e4'], ['d7', 'd5'], ['e4', 'd5'], ['d8', 'd5']]) {
    game = play(game, { from: index(from), to: index(to) });
  }
  await loadFog(page, game);
  const material = page.getByRole('group', { name: 'Pieces you captured' });
  await expect(material.getByRole('img', { name: 'Captured Black pawn' })).toBeVisible();
  await expect(material.locator('img')).toHaveAttribute('src', /bP\.svg$/);
  await expect(material.getByRole('img', { name: 'Captured White pawn' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Previous position', exact: true }).click();
  await page.getByRole('button', { name: 'Previous position', exact: true }).click();
  await expect(material).toContainText('None yet');
  await expect(material.locator('img')).toHaveCount(0);
  await page.getByRole('button', { name: 'Return to latest' }).click();
  await page.reload();
  await expect(material).toHaveCount(0);
  await page.getByRole('button', { name: 'I’m the white player' }).click();
  await expect(material.locator('img')).toHaveCount(1);
  await page.locator('[data-square="b1"]').click();
  await page.locator('[data-square="c3"]').click();
  await expect(page.getByRole('heading', { name: 'Pass to Black.' })).toBeVisible();
  await expect(material).toHaveCount(0);
  await page.getByRole('button', { name: 'I’m the black player' }).click();
  await expect(material.getByRole('img', { name: 'Captured White pawn' })).toBeVisible();
  await expect(material.locator('img')).toHaveAttribute('src', /wP\.svg$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(material).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('captured Fog pieces are grouped by ascending value with overlap only within groups', async ({ page }) => {
  const game = newGame('fog', 'fog', 42);
  game.rules!.events = (['q', 'p', 'r', 'n', 'p', 'b', 'n'] as const).map((captured, i) => ({
    color: 'w', kind: 'p', pieceId: i, from: index('a2'), to: index('b3'),
    capture: index('b3'), captured,
  }));
  await loadFog(page, game);
  const groups = page.locator('.captured-group');
  expect(await groups.evaluateAll(elements => elements.map(el => el.getAttribute('data-kind')))).toEqual(['p', 'n', 'b', 'r', 'q']);
  await expect(page.locator('.captured-group[data-kind="p"] .captured-piece')).toHaveCount(2);
  const first = await page.locator('.captured-group[data-kind="p"] .captured-piece').nth(0).boundingBox();
  const second = await page.locator('.captured-group[data-kind="p"] .captured-piece').nth(1).boundingBox();
  expect(second!.x).toBeGreaterThan(first!.x);
  expect(second!.x).toBeLessThan(first!.x + first!.width);
  await expect(page.locator('.captured-piece')).toHaveCount(7);
});

test('a different piece reveals the identity of a pawn blocker', async ({ page }) => {
  await loadFog(page, position({ c2: { color: 'w', kind: 'n' } }));
  const blocker = page.locator('[data-square="e3"]');
  await expect(blocker).toHaveAttribute('aria-label', 'e3 Black queen');
  await expect(blocker.locator('.unknown-occupant')).toHaveCount(0);
  await expect(blocker.locator('.black-piece')).toHaveCount(1);
  await page.locator('[data-square="c2"]').click();
  await expect(blocker).toHaveClass(/legal-square/);
  await blocker.click();
  await expect(page.getByRole('heading', { name: 'Pass to Black.' })).toBeVisible();
});

test('hidden opponent history and highlights remain hidden after reveal, flip and reload', async ({ page }) => {
  const g = position();
  g.history = [{ color: 'b', label: 'Ra7-a8', move: { from: index('a7'), to: index('a8') } }];
  g.turns.b = 1;
  await loadFog(page, g);
  await expect(page.locator('.move-history')).toContainText('Hidden move');
  await expect(page.locator('.move-history')).not.toContainText('Ra7-a8');
  await expect(page.locator('.last-square')).toHaveCount(0);
  await page.getByRole('button', { name: /Reveal to opponent/ }).click();
  await page.getByRole('button', { name: 'Reveal my drawback', exact: true }).click();
  await expect(page.locator('[data-square="a8"]')).toHaveClass(/fog-square/);
  await page.getByRole('button', { name: 'Flip board' }).click();
  await expect(page.locator('[data-square="e3"] .unknown-occupant')).toBeVisible();
  await page.reload();
  await expect(page.locator('.board .piece')).toHaveCount(0);
  await page.getByRole('button', { name: 'I’m the white player' }).click();
  await expect(page.locator('[data-square="e3"] .unknown-occupant')).toBeVisible();
  await expect(page.locator('.move-history')).not.toContainText('Ra7-a8');
});

test('local handoff masks the board, then restores the next player’s perspective', async ({ page }) => {
  await loadFog(page, newGame('fog', 'horse'));
  await expect(page.locator('.board .white-piece')).toHaveCount(16);
  await expect(page.locator('.board .black-piece')).toHaveCount(0);
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  await expect(page.getByRole('heading', { name: 'Pass to Black.' })).toBeVisible();
  await expect(page.locator('.fog-square')).toHaveCount(64);
  await expect(page.locator('.board .piece')).toHaveCount(0);
  await page.getByRole('button', { name: 'I’m the black player' }).click();
  await expect(page.locator('.fog-square')).toHaveCount(0);
  await expect(page.locator('.board .white-piece')).toHaveCount(16);
  await expect(page.locator('.board .black-piece')).toHaveCount(16);
  await page.locator('[data-square="e7"]').click();
  await page.locator('[data-square="e5"]').click();
  await page.getByRole('button', { name: 'I’m the white player' }).click();
  await expect(page.locator('[data-square="e5"]')).toHaveClass(/unknown-square/);
  await expect(page.locator('.board .black-piece')).toHaveCount(0);
  await expect(page.locator('.move-history')).toContainText('Hidden move');
});

test('game over lifts fog and shows the complete history', async ({ page }) => {
  const g = position();
  g.result = { winner: 'b', reason: 'White has no legal moves' };
  g.history = [{ color: 'b', label: 'Ra7-a8', move: { from: index('a7'), to: index('a8') } }];
  await loadFog(page, g, 'ai');
  await expect(page.locator('.fog-square, .unknown-square')).toHaveCount(0);
  await expect(page.locator('[data-square="e3"]')).toHaveAttribute('aria-label', 'e3 Black queen');
  await expect(page.locator('.move-history')).toContainText('Ra7-a8');
  await expect(page.locator('.opponent-card')).toContainText('Horse Tranquilizer');
});

test('Fog of War is selectable and playable against the AI without exposing its moves', async ({ page }) => {
  await loadFog(page, newGame('horse', 'horse'), 'ai');
  await page.getByRole('button', { name: /New game/ }).click();
  await page.getByLabel('Your drawback', { exact: true }).selectOption('fog');
  await expect(page.getByRole('dialog')).toContainText(DRAWBACKS.find(d => d.id === 'fog')!.description);
  await page.getByRole('button', { name: /Let’s play/ }).click();
  await expect(page.locator('.fog-square')).not.toHaveCount(0);
  await page.locator('[data-square="e2"]').click();
  await expect(page.locator('.legal-square')).toHaveCount(2);
  await page.locator('[data-square="e4"]').click();
  await expect(page.locator('.turn-card h2')).toHaveText('White to move.', { timeout: 20000 });
  await expect(page.locator('.move-history')).toContainText('Hidden move');
  await expect(page.locator('.last-square')).toHaveCount(0);
});

test('Black can move after each immediate Fog AI reply without reloading', async ({ page }) => {
  await loadFog(page, newGame('horse', 'horse'), 'ai');
  await page.getByRole('button', { name: /New game/ }).click();
  await page.getByLabel('Play as').selectOption('b');
  await page.getByLabel('Your drawback', { exact: true }).selectOption('fog');
  await page.locator('#opponent-drawback-choice').selectOption('fog');
  await page.getByRole('button', { name: /Let’s play/ }).click();
  for (const [from, to] of [['g8', 'f6'], ['b8', 'c6']]) {
    await expect(page.locator('.turn-card h2')).toHaveText('Black to move.');
    await expect(page.locator(`[data-square="${from}"]`)).toHaveAttribute('draggable', 'true');
    await page.locator(`[data-square="${from}"]`).click();
    await expect(page.locator(`[data-square="${to}"]`)).toHaveClass(/legal-square/);
    await page.locator(`[data-square="${to}"]`).click();
    await expect(page.locator(`[data-square="${to}"] .piece`)).toHaveAttribute('src', /bN\.svg$/);
  }
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('fog renders at mobile sizes in dark mode', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await loadFog(page, position());
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('[data-square="e3"] .unknown-occupant')).toBeVisible();
  const background = await page.locator('[data-square="a8"] .fog-effect').evaluate(el => getComputedStyle(el).backgroundImage);
  expect(background).toContain('radial-gradient');
});
