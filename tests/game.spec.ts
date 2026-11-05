import { expect, test } from '@playwright/test';
import { DRAWBACKS, index, newGame, type Game, type Piece } from '../src/game';

const saveKey = 'drawback-chess-v1';
test('all Cburnett pieces load locally in both themes with license attribution', async ({ page, request }) => {
  for (const color of ['w', 'b']) {
    for (const kind of ['K', 'Q', 'R', 'B', 'N', 'P']) {
      const response = await request.get(`/pieces/cburnett/${color}${kind}.svg`);
      expect(response.ok()).toBe(true);
      expect(await response.text()).toContain('<svg');
    }
  }
  expect((await request.get('/pieces/cburnett/COPYING.txt')).ok()).toBe(true);
  expect(await (await request.get('/pieces/cburnett/CREDITS.md')).text()).toContain('Colin M. L. Burnett');
  for (const theme of ['light', 'dark']) {
    await page.goto(`/?scoutTheme=${theme}`);
    await expect(page.locator('.board img.piece')).toHaveCount(32);
    await expect.poll(() => page.locator('.board img.piece').evaluateAll(images =>
      images.every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))).toBe(true);
    await expect(page.locator('[data-square="e1"] .piece')).toHaveAttribute('src', /wK\.svg$/);
  }
});
async function loadPosition(page: import('@playwright/test').Page, game: Game, mode = 'local', human = 'w') {
  await page.addInitScript(({ game, mode, human, saveKey }) => {
    localStorage.setItem(saveKey, JSON.stringify({ version: 1, game, mode, human, flipped: false, strength: 200 }));
  }, { game, mode, human, saveKey });
  await page.goto('/');
  if (mode === 'local') await page.getByRole('button', { name: /I’m the .* player/ }).click();
}
test('highlights moves, rejects an illegal destination and plays a real Stockfish reply', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1260, height: 840 });
  await loadPosition(page, newGame('horse', 'even'), 'ai');
  const board = await page.locator('.board').boundingBox();
  expect(board).not.toBeNull();
  expect(board!.width).toBeGreaterThan(700);
  await expect(page.locator('[data-square="e2"] .piece')).toHaveAttribute('src', /pieces\/cburnett\/wP\.svg$/);
  await expect(page.locator('[data-square="e7"] .piece')).toHaveAttribute('src', /pieces\/cburnett\/bP\.svg$/);
  await expect.poll(() => page.locator('.board img.piece').evaluateAll(images =>
    images.every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))).toBe(true);
  await page.locator('[data-square="e2"]').click();
  await expect(page.locator('.legal-square')).toHaveCount(2);
  await page.locator('[data-square="e5"]').click();
  await expect(page.locator('[data-square="e2"]')).toHaveAttribute('aria-label', /White pawn/);
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  await expect(page.locator('.engine-note')).toContainText('Stockfish 19 · constrained search', { timeout: 20000 });
  await expect(page.locator('.move-pair')).toHaveCount(1);
  await expect(page.locator('.turn-card h2')).toHaveText('White to move.');
  await expect(page.locator('.page-intro')).toHaveCount(0);
  await expect(page.locator('.turn-card p')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
  await expect(page.getByRole('button', { name: /View my drawback|Hide my drawback/ })).toHaveCount(0);
  await expect(page.locator('.drawback-content')).toContainText('Horse Tranquilizer');
  await expect(page.locator('.opponent-card')).not.toContainText('Even Keeled');
  await page.getByRole('button', { name: /Reveal to opponent/ }).click();
  await page.getByRole('button', { name: 'Reveal my drawback', exact: true }).click();
  await expect(page.locator('.secret-tag')).toHaveText('REVEALED');
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('drawback-chess-v1')!);
    if (saved.game.history.length !== 2 || !saved.game.revealed.w) throw new Error('Save did not persist');
  });
});
test('a local player can reveal their drawback even off turn', async ({ page }) => {
  await loadPosition(page, newGame('castle', 'even'));
  await page.getByRole('button', { name: 'Reveal Black drawback', exact: true }).click();
  await page.getByRole('button', { name: 'Reveal Black’s drawback', exact: true }).click();
  await expect(page.locator('.opponent-card')).toContainText('Even Keeled');
  await expect(page.locator('.turn-card h2')).toHaveText('White to move.');
  await expect(page.locator('.secret-tag')).toHaveText('ONLY YOU');
});
test('new game supports local private handoff and revealing either player’s secret', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /New game/ }).click();
  await page.getByRole('button', { name: /Pass & play/ }).click();
  await page.getByLabel('White player’s drawback').selectOption('horse');
  await page.getByRole('button', { name: /Let’s play/ }).click();
  await expect(page.getByRole('heading', { name: 'Pass to White.' })).toBeVisible();
  await page.getByRole('button', { name: 'I’m the white player' }).click();
  const whiteSecret = await page.locator('.drawback-content h3').innerText();
  await page.getByRole('button', { name: /Reveal to opponent/ }).click();
  await page.getByRole('button', { name: 'Reveal my drawback', exact: true }).click();
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  await expect(page.getByRole('heading', { name: 'Pass to Black.' })).toBeVisible();
  await expect(page.locator('.drawback-content h3')).toHaveCount(0);
  await page.getByRole('button', { name: 'I’m the black player' }).click();
  await expect(page.locator('.opponent-card')).toContainText(whiteSecret);
  await expect(page.locator('.drawback-content h3')).toBeVisible();
  await page.getByRole('button', { name: /Reveal to opponent/ }).click();
  await page.getByRole('button', { name: 'Reveal my drawback', exact: true }).click();
  await expect(page.locator('.secret-tag')).toHaveText('REVEALED');
});
test('play as Black starts an AI opening and survives a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /New game/ }).click();
  await page.getByLabel('Play as').selectOption('b');
  await page.getByRole('button', { name: /Let’s play/ }).click();
  await expect(page.locator('.engine-note')).toContainText(/Stockfish 19 · constrained search|Variant engine · fog-limited view/, { timeout: 20000 });
  await expect(page.locator('.board > button').first()).toHaveAttribute('data-square', 'h1');
  const secret = await page.locator('.drawback-content h3').innerText();
  await page.reload();
  await expect(page.locator('.drawback-content h3')).toHaveText(secret);
  await expect(page.locator('.move-pair')).toHaveCount(1);
  await expect(page.locator('.turn-card h2')).toHaveText('Black to move.');
});
test('drag and drop and keyboard navigation both work', async ({ page }) => {
  await loadPosition(page, newGame('horse', 'horse'));
  await page.locator('[data-square="d2"]').dragTo(page.locator('[data-square="d4"]'));
  await expect(page.getByRole('heading', { name: 'Pass to Black.' })).toBeVisible();
  await page.getByRole('button', { name: 'I’m the black player' }).click();
  await page.locator('[data-square="e7"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.legal-square')).toHaveCount(2);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-square="e8"]')).toBeFocused();
});
test('promotion chooser and king en passant end the game', async ({ page }) => {
  const g = newGame('horse', 'horse');
  g.board.fill(null);
  const pieces: Record<string, Piece> = { e1: { color: 'w', kind: 'k' }, h1: { color: 'w', kind: 'r' }, e2: { color: 'b', kind: 'p' }, a8: { color: 'b', kind: 'k' } };
  for (const [at, p] of Object.entries(pieces)) g.board[index(at)] = p;
  await loadPosition(page, g);
  await page.locator('[data-square="e1"]').click();
  await expect(page.locator('[data-square="g1"]')).toHaveClass(/legal-square/);
  await page.locator('[data-square="g1"]').click();
  await page.getByRole('button', { name: 'I’m the black player' }).click();
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e1"]').click();
  await expect(page.getByRole('dialog')).toContainText('Choose your promotion.');
  await page.getByRole('button', { name: 'Promote to queen' }).click();
  await expect(page.locator('.turn-card h2')).toHaveText('Black wins');
  await expect(page.locator('.turn-card')).toContainText('King captured');
  await expect(page.locator('.opponent-card')).toContainText('Horse Tranquilizer');
  await expect(page.locator('.opponent-card')).toContainText('Your knights can move, but they cannot capture.');
  await expect(page.locator('.secret-tag')).toHaveText('REVEALED');
  await expect(page.getByRole('button', { name: /Reveal .* drawback/ })).toHaveCount(0);
});

for (const reason of ['King captured', 'White has no legal moves', 'Castle Doctrine: a rook was captured']) {
  test(`finished AI games reveal both drawbacks after reload: ${reason}`, async ({ page }) => {
    const g = newGame('horse', 'command');
    g.result = { winner: 'b', reason };
    await loadPosition(page, g, 'ai');
    await expect(page.locator('.opponent-card')).toContainText('Centralized Command');
    await expect(page.locator('.opponent-card')).toContainText(DRAWBACKS.find(d => d.id === 'command')!.description);
    await expect(page.locator('.secret-tag')).toHaveText('REVEALED');
    await page.reload();
    await expect(page.locator('.opponent-card')).toContainText('Centralized Command');
    await expect(page.getByRole('button', { name: 'Revealed', exact: true })).toBeDisabled();
  });
}
test('mobile layout, dark theme, rules and glossary remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.square')).toHaveCount(64);
  await page.getByRole('button', { name: /The drawbacks/ }).click();
  await expect(page.locator('.glossary article')).toHaveCount(DRAWBACKS.length);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: /How to play/ }).click();
  await expect(page.getByRole('dialog')).toContainText('There is no check, checkmate, or stalemate.');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('corrupt saved game shows a recovery message instead of a blank screen', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('drawback-chess-v1', '{"version":1,"game":{}}'));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('could not be restored');
  await expect(page.locator('.square')).toHaveCount(64);
});
test('a failed Stockfish download visibly switches to the legal variant fallback', async ({ page }) => {
  await page.route('**/engine/stockfish.js', route => route.abort());
  await loadPosition(page, newGame('horse', 'cess'), 'ai');
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  await expect(page.locator('.engine-note')).toContainText('Variant engine · Stockfish unavailable', { timeout: 20000 });
  await expect(page.getByRole('alert')).toContainText('Stockfish');
  await expect(page.locator('.turn-card h2')).toHaveText('White to move.');
  await expect(page.locator('.move-pair')).toHaveCount(1);
});

test('before-move info updates after king moves and stays hidden during handoff', async ({ page }) => {
  await loadPosition(page, newGame('command', 'even'));
  const info = page.getByRole('status', { name: 'Your move restriction' });
  await expect(info).toContainText('Cannot capture.');
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e3"]').click();
  await expect(info).toHaveCount(0);
  await page.getByRole('button', { name: 'I’m the black player' }).click();
  await expect(info).toHaveText(/Cannot capture this move. Can capture next move./);
  await page.locator('[data-square="a7"]').click();
  await page.locator('[data-square="a6"]').click();
  await page.getByRole('button', { name: 'I’m the white player' }).click();
  await page.locator('[data-square="e1"]').click();
  await page.locator('[data-square="e2"]').click();
  await page.getByRole('button', { name: 'I’m the black player' }).click();
  await expect(info).toContainText('Can capture this move. Cannot capture next move.');
  await page.locator('[data-square="a6"]').click();
  await page.locator('[data-square="a5"]').click();
  await page.getByRole('button', { name: 'I’m the white player' }).click();
  await expect(info).toContainText('Can capture for the next 3 moves (including this move).');
});

test('Alternator prompts update before each turn', async ({ page }) => {
  await loadPosition(page, newGame('alternator', 'horse'));
  const info = page.getByRole('status', { name: 'Your move restriction' });
  await expect(info).toContainText('May move a pawn or a non-pawn.');
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  await page.getByRole('button', { name: 'I’m the black player' }).click();
  await expect(info).toHaveCount(0);
  await page.locator('[data-square="a7"]').click();
  await page.locator('[data-square="a6"]').click();
  await page.getByRole('button', { name: 'I’m the white player' }).click();
  await expect(info).toContainText('Must move a non-pawn.');
  await page.locator('[data-square="g1"]').click();
  await page.locator('[data-square="f3"]').click();
  await page.getByRole('button', { name: 'I’m the black player' }).click();
  await page.locator('[data-square="a6"]').click();
  await page.locator('[data-square="a5"]').click();
  await page.getByRole('button', { name: 'I’m the white player' }).click();
  await expect(info).toContainText('Must move a pawn.');
});

test('AI drawback status is never exposed while the human waits', async ({ page }) => {
  await loadPosition(page, newGame('horse', 'command'), 'ai');
  await expect(page.getByRole('status', { name: 'Your move restriction' })).toHaveCount(0);
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  await expect(page.locator('.turn-card h2')).toHaveText('White to move.', { timeout: 20000 });
  await expect(page.getByRole('status', { name: 'Your move restriction' })).toHaveCount(0);
  await expect(page.locator('.sidebar')).not.toContainText('Cannot capture.');
});

test('pieces slide for 200ms before local handoff', async ({ page }) => {
  await loadPosition(page, newGame('horse', 'horse'));
  await page.evaluate(() => {
    document.querySelector('.board')!.addEventListener('animationstart', event => {
      const target = event.target as HTMLElement;
      if (!target.classList.contains('piece-slide')) return;
      const animation = target.getAnimations()[0];
      document.body.dataset.slide = JSON.stringify({
        duration: animation.effect!.getTiming().duration,
        x: target.style.getPropertyValue('--slide-x'),
        y: target.style.getPropertyValue('--slide-y'),
        handoff: document.querySelector('[role="dialog"]') !== null,
      });
    });
  });
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  await expect(page.getByRole('heading', { name: 'Pass to Black.' })).toBeVisible();
  const slide = await page.evaluate(() => JSON.parse(document.body.dataset.slide!));
  expect(slide).toEqual({ duration: 200, x: '0%', y: '200%', handoff: false });
  await expect(page.locator('.piece-slide')).toHaveCount(0);
});

test('castling slides both pieces in the flipped board direction', async ({ page }) => {
  const g = newGame('horse', 'horse');
  g.board.fill(null);
  g.board[index('e1')] = { color: 'w', kind: 'k' };
  g.board[index('h1')] = { color: 'w', kind: 'r' };
  g.board[index('a8')] = { color: 'b', kind: 'k' };
  await loadPosition(page, g);
  await page.getByRole('button', { name: 'Flip board' }).click();
  await page.evaluate(() => {
    const slides: { square: string | null; duration: number; x: string }[] = [];
    document.querySelector('.board')!.addEventListener('animationstart', event => {
      const target = event.target as HTMLElement;
      if (!target.classList.contains('piece-slide')) return;
      slides.push({
        square: target.parentElement!.getAttribute('data-square'),
        duration: Number(target.getAnimations()[0].effect!.getTiming().duration),
        x: target.style.getPropertyValue('--slide-x'),
      });
      document.body.dataset.slides = JSON.stringify(slides);
    });
  });
  await page.locator('[data-square="e1"]').click();
  await page.locator('[data-square="g1"]').click();
  await expect(page.getByRole('heading', { name: 'Pass to Black.' })).toBeVisible();
  const slides = await page.evaluate(() => JSON.parse(document.body.dataset.slides!));
  expect(slides).toEqual(expect.arrayContaining([
    { square: 'g1', duration: 200, x: '200%' },
    { square: 'f1', duration: 200, x: '-200%' },
  ]));
  expect(slides).toHaveLength(2);
});

test('reduced motion skips piece slides', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await loadPosition(page, newGame('horse', 'horse'));
  await page.evaluate(() => {
    document.body.dataset.slideCount = '0';
    document.querySelector('.board')!.addEventListener('animationstart', () => {
      document.body.dataset.slideCount = String(Number(document.body.dataset.slideCount) + 1);
    });
  });
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();
  await expect(page.getByRole('heading', { name: 'Pass to Black.' })).toBeVisible();
  expect(await page.locator('body').getAttribute('data-slide-count')).toBe('0');
});

test('new game offers every drawback and applies the selection to White or Black', async ({ page }) => {
  await page.goto('/');
  for (const [color, drawback] of [['w', 'command'], ['b', 'alternator']] as const) {
    await page.getByRole('button', { name: /New game/ }).click();
    const choice = page.getByLabel('Your drawback', { exact: true });
    await expect(choice).toHaveValue('random');
    await expect(choice.locator('option')).toHaveCount(DRAWBACKS.length + 6);
    await page.getByLabel('Play as').selectOption(color);
    await choice.selectOption(drawback);
    await expect(page.getByRole('dialog')).toContainText(DRAWBACKS.find(d => d.id === drawback)!.description);
    await page.getByRole('button', { name: /Let’s play/ }).click();
    await expect(page.locator('.turn-card h2')).toHaveText(`${color === 'w' ? 'White' : 'Black'} to move.`, { timeout: 20000 });
    await expect(page.locator('.drawback-content h3')).toHaveText(DRAWBACKS.find(d => d.id === drawback)!.name);
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem('drawback-chess-v1')!));
    expect(state.game.drawbacks[color]).toBe(drawback);
    expect(DRAWBACKS.map(d => d.id)).toContain(state.game.drawbacks[color === 'w' ? 'b' : 'w']);
    expect(state.game.revealed).toEqual({ w: false, b: false });
  }
});

test('drawback selection supports local play, cancel and returning to Random', async ({ page }) => {
  await page.goto('/');
  const before = await page.evaluate(() => localStorage.getItem('drawback-chess-v1'));
  await page.getByRole('button', { name: /New game/ }).click();
  await page.getByLabel('Your drawback', { exact: true }).selectOption('cess');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  expect(await page.evaluate(() => localStorage.getItem('drawback-chess-v1'))).toBe(before);
  await page.getByRole('button', { name: /New game/ }).click();
  await expect(page.getByLabel('Your drawback', { exact: true })).toHaveValue('random');
  await page.getByRole('button', { name: /Pass & play/ }).click();
  await page.getByLabel('White player’s drawback').selectOption('even');
  await page.getByRole('button', { name: /Let’s play/ }).click();
  await page.getByRole('button', { name: 'I’m the white player' }).click();
  await expect(page.locator('.drawback-content h3')).toHaveText('Even Keeled');
  await page.getByRole('button', { name: /New game/ }).click();
  await page.getByLabel('White player’s drawback').selectOption('castle');
  await page.getByLabel('White player’s drawback').selectOption('random');
  await page.getByRole('button', { name: /Let’s play/ }).click();
  await page.getByRole('button', { name: 'I’m the white player' }).click();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('drawback-chess-v1')!));
  expect(DRAWBACKS.map(d => d.id)).toContain(state.game.drawbacks.w);
  expect(DRAWBACKS.map(d => d.id)).toContain(state.game.drawbacks.b);
});

test('attacked king shows a red halo and can still ignore the threat', async ({ page }) => {
  const g = newGame('horse', 'horse');
  g.board.fill(null);
  g.board[index('e1')] = { color: 'w', kind: 'k' };
  g.board[index('a2')] = { color: 'w', kind: 'p' };
  g.board[index('e8')] = { color: 'b', kind: 'r' };
  g.board[index('a8')] = { color: 'b', kind: 'k' };
  await loadPosition(page, g);
  await expect(page.locator('[data-square="e1"]')).toHaveAttribute('aria-label', /under attack/);
  await expect(page.locator('[data-square="e1"] .king-under-attack')).toHaveCount(1);
  await expect(page.locator('[data-square="a8"] .king-under-attack')).toHaveCount(0);
  const halo = await page.locator('.king-under-attack').evaluate(el => ({
    background: getComputedStyle(el, '::before').backgroundImage,
    danger: getComputedStyle(el).getPropertyValue('--cp-danger').trim(),
  }));
  expect(halo.background).toContain('radial-gradient');
  expect(halo.danger).toBeTruthy();
  await page.locator('[data-square="a2"]').click();
  await page.locator('[data-square="a3"]').click();
  await expect(page.getByRole('heading', { name: 'Pass to Black.' })).toBeVisible();
});

test('king halo disappears when the king moves out of attack', async ({ page }) => {
  const g = newGame('horse', 'horse');
  g.board.fill(null);
  g.board[index('e1')] = { color: 'w', kind: 'k' };
  g.board[index('e8')] = { color: 'b', kind: 'r' };
  g.board[index('a8')] = { color: 'b', kind: 'k' };
  await loadPosition(page, g);
  await expect(page.locator('.king-under-attack')).toHaveCount(1);
  await page.locator('[data-square="e1"]').click();
  await page.locator('[data-square="d1"]').click();
  await expect(page.locator('.king-under-attack')).toHaveCount(0);
  await expect(page.locator('[data-square="d1"]')).not.toHaveAttribute('aria-label', /under attack/);
});
