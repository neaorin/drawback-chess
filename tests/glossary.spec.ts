import { expect, test } from '@playwright/test';
import { DRAWBACKS, drawbackDescription, index, newGame } from '../src/game';
import { DIFFICULTY_LEVELS, difficultyLevel } from '../src/drawback-catalogue';
import { templateDescription } from '../src/drawback-state';
import { unluckySquares } from '../src/drawback-helpers';
import { legalMoves, square } from '../src/game';
import { initialRules } from '../src/drawback-state';

test('bridge knights highlight and capture across dry endpoints', async ({ page }) => {
  const game = newGame('bridge-over-troubled-water', 'horse', 42);
  game.board.fill(null);
  for (const [at, piece] of Object.entries({
    g1: { color: 'w', kind: 'k' }, g8: { color: 'b', kind: 'k' },
    e4: { color: 'w', kind: 'n' }, f3: { color: 'w', kind: 'n' },
    f6: { color: 'b', kind: 'n' }, d4: { color: 'b', kind: 'n' },
  } as const)) game.board[index(at)] = piece;
  game.rules = initialRules(game, 42);
  await page.addInitScript(game => {
    localStorage.setItem('drawback-chess-v1', JSON.stringify({
      version: 1, game, mode: 'local', human: 'w', flipped: false, strength: 200,
    }));
  }, game);
  await page.goto('/');
  await page.getByRole('button', { name: /I’m the .* player/ }).click();
  await page.locator('[data-square="e4"]').click();
  await expect(page.locator('[data-square="f6"]')).toHaveClass(/legal-square/);
  await page.locator('[data-square="f3"]').click();
  await expect(page.locator('[data-square="d4"]')).toHaveClass(/legal-square/);
  await page.locator('[data-square="d4"]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('[data-square="d4"] img')).toHaveAttribute('src', /wN\.svg$/);
});

for (const drawback of ['ooh-shiny', 'simplifier', 'escort-mission', 'evil-twin'] as const) {
  test(`${drawback} highlights mandatory victims without selecting a piece`, async ({ page }) => {
    const game = newGame(drawback, 'horse', 42);
    game.board.fill(null);
    for (const [at, piece] of Object.entries({
      h1: { color: 'w', kind: 'k' }, h8: { color: 'b', kind: 'k' },
      d4: { color: 'w', kind: 'r' }, d6: { color: 'b', kind: 'q' },
      a4: { color: 'b', kind: 'r' }, f4: { color: 'b', kind: 'p' },
      f8: { color: 'b', kind: 'r' },
    } as const)) game.board[index(at)] = piece;
    const victims = drawback === 'escort-mission' ? ['g1', 'g2'] : drawback === 'evil-twin' ? ['a4', 'f8'] : ['d6', 'a4'];
    if (drawback === 'escort-mission') {
      game.board[index('g1')] = { color: 'b', kind: 'p' };
      game.board[index('g2')] = { color: 'b', kind: 'p' };
    }
    if (drawback === 'evil-twin') {
      game.board[index('e8')] = { color: 'w', kind: 'r' };
    }
    game.rights = { w: { king: false, queen: false }, b: { king: false, queen: false } };
    game.rules = initialRules(game, 42);
    await page.addInitScript(game => {
      localStorage.setItem('drawback-chess-v1', JSON.stringify({
        version: 1, game, mode: 'local', human: 'w', flipped: false, strength: 200,
      }));
    }, game);
    await page.goto('/');
    await expect(page.locator('.mandatory-capture')).toHaveCount(0);
    await page.getByRole('button', { name: /I’m the .* player/ }).click();
    await expect(page.locator('.mandatory-capture')).toHaveCount(2);
    for (const at of victims) {
      await expect(page.locator(`[data-square="${at}"]`).getByRole('img', { name: 'Mandatory capture target' })).toBeVisible();
    }
    await expect(page.locator('[data-square="f4"] .mandatory-capture')).toHaveCount(0);
    await page.getByRole('button', { name: 'Flip board', exact: true }).click();
    await expect(page.locator(`[data-square="${victims[0]}"] .mandatory-capture`)).toBeVisible();
    await page.locator(`[data-square="${drawback === 'escort-mission' ? 'h1' : 'd4'}"]`).click();
    await page.locator(`[data-square="${victims[0]}"]`).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('.mandatory-capture')).toHaveCount(0);
    await page.getByRole('button', { name: /I’m the .* player/ }).click();
    await expect(page.locator('.mandatory-capture')).toHaveCount(0);
  });
}

test('situational hints are concise, conditional and selection-specific', async ({ page }) => {
  const game = newGame('queen-disguise', 'horse', 42);
  game.rules!.pieces[index('d1')].queenMode = 'r';
  await page.addInitScript(game => {
    if (!localStorage.getItem('message-seeded')) {
      localStorage.setItem('drawback-chess-v1', JSON.stringify({
        version: 1, game, mode: 'local', human: 'w', flipped: false, strength: 200,
      }));
      localStorage.setItem('message-seeded', 'true');
    }
  }, game);
  await page.goto('/');
  await page.getByRole('button', { name: /I’m the .* player/ }).click();
  const info = page.getByRole('status', { name: 'Your move restriction' });
  await expect(info).toHaveCount(0);
  await page.locator('[data-square="d1"]').click();
  await expect(info).toHaveText('Queen moves like a rook.');
  await page.locator('[data-square="e2"]').click();
  await expect(info).toHaveCount(0);
  await page.getByRole('button', { name: /New game/ }).click();
  await page.locator('#drawback-choice').selectOption('bongcloud');
  await page.getByRole('button', { name: /Let’s play/ }).click();
  await page.getByRole('button', { name: /I’m the .* player/ }).click();
  await expect(info).toHaveText('Must move a pawn or king.');
  await page.getByRole('button', { name: /New game/ }).click();
  await page.locator('#drawback-choice').selectOption('atomic-bomb');
  await page.getByRole('button', { name: /Let’s play/ }).click();
  await page.getByRole('button', { name: /I’m the .* player/ }).click();
  await expect(info).toHaveCount(0);
  await expect(page.locator('.drawback-content')).toContainText('Atomic Bomb');
});

test('Unlucky marks exactly its forbidden destinations without a turn message', async ({ page }) => {
  const game = newGame('unlucky', 'horse', 42);
  await page.addInitScript(game => {
    if (!localStorage.getItem('unlucky-seeded')) {
      localStorage.setItem('drawback-chess-v1', JSON.stringify({
        version: 1, game, mode: 'local', human: 'w', flipped: false, strength: 200,
      }));
      localStorage.setItem('unlucky-seeded', 'true');
    }
  }, game);
  await page.goto('/');
  await expect(page.locator('.unlucky-forbidden')).toHaveCount(0);
  await page.getByRole('button', { name: /I’m the .* player/ }).click();
  const expected = [...unluckySquares(game.rules!.seed, 'w', 0)].map(square).sort();
  const marks = () => page.locator('.unlucky-forbidden').evaluateAll(elements =>
    elements.map(e => e.parentElement!.getAttribute('data-square')).sort());
  expect(await marks()).toEqual(expected);
  await expect(page.getByRole('status', { name: 'Your move restriction' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Flip board', exact: true }).click();
  expect(await marks()).toEqual(expected);
  await page.reload();
  await page.getByRole('button', { name: /I’m the .* player/ }).click();
  expect(await marks()).toEqual(expected);
  const move = legalMoves(game)[0];
  expect(expected).not.toContain(square(move.to));
  await page.locator(`[data-square="${square(move.from)}"]`).click();
  await expect(page.locator('.legal-square .unlucky-forbidden')).toHaveCount(0);
  await page.locator(`[data-square="${square(move.to)}"]`).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.unlucky-forbidden')).toHaveCount(0);
  await page.getByRole('button', { name: /I’m the .* player/ }).click();
  await expect(page.locator('.unlucky-forbidden')).toHaveCount(0);
});

test('individual drawback options have explanatory tooltips without template placeholders', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /New game/ }).click();
  const tooltips = await page.locator('#drawback-choice optgroup[label="Individual drawbacks"] option')
    .evaluateAll(options => options.map(option => option.getAttribute('title')));
  expect(tooltips).toEqual(DRAWBACKS.map(d => templateDescription(d.description)));
  expect(tooltips.every(text => text && !text.includes('$'))).toBe(true);
  await expect(page.locator('#drawback-choice optgroup[label="Random options"] option[title]')).toHaveCount(0);
});

for (const color of ['w', 'b', 'local'] as const) {
  test(`opponent selector applies independently when playing ${color}`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /New game/ }).click();
    if (color === 'local') await page.getByRole('button', { name: /Pass & play/ }).click();
    else await page.getByLabel('Play as').selectOption(color);
    const own = page.locator('#drawback-choice');
    const opponent = page.locator('#opponent-drawback-choice');
    expect(await opponent.innerHTML()).toBe(await own.innerHTML());
    await own.selectOption('horse');
    await opponent.selectOption('random-hard');
    await expect(page.locator('.difficulty-badge')).toHaveCount(2);
    await page.getByRole('button', { name: /Let’s play/ }).click();
    if (color === 'local') await page.getByRole('button', { name: /I’m the .* player/ }).click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('drawback-chess-v1')!));
    const ownColor = color === 'b' ? 'b' : 'w';
    const enemyColor = ownColor === 'w' ? 'b' : 'w';
    expect(saved.game.drawbacks[ownColor]).toBe('horse');
    const selected = DRAWBACKS.find(d => d.id === saved.game.drawbacks[enemyColor])!;
    expect(difficultyLevel(selected.difficulty).label).toBe('Hard');
    expect(saved.game.revealed).toEqual({ w: false, b: false });
    await page.getByRole('button', { name: /New game/ }).click();
    await expect(own).toHaveValue('random');
    await expect(opponent).toHaveValue('random');
    await opponent.selectOption('cess');
    await page.getByRole('button', { name: /Let’s play/ }).click();
    await expect.poll(() => page.evaluate(color =>
      JSON.parse(localStorage.getItem('drawback-chess-v1')!).game.drawbacks[color], enemyColor)).toBe('cess');
  });
}

test('difficulty-specific Random options assign a matching drawback in local play', async ({ page }) => {
  await page.goto('/');
  for (const level of DIFFICULTY_LEVELS) {
    await page.getByRole('button', { name: /New game/ }).click();
    await expect(page.locator('#drawback-choice optgroup[label="Random options"] option')).toHaveCount(6);
    await expect(page.locator('#drawback-choice optgroup[label="Individual drawbacks"] option')).toHaveCount(181);
    await page.getByRole('button', { name: /Pass & play/ }).click();
    await page.locator('#drawback-choice').selectOption(level.choice);
    await expect(page.locator('.difficulty-badge')).toContainText(level.label);
    await page.getByRole('button', { name: /Let’s play/ }).click();
    await page.getByRole('button', { name: /I’m the .* player/ }).click();
    const id = await page.evaluate(() => JSON.parse(localStorage.getItem('drawback-chess-v1')!).game.drawbacks.w);
    const selected = DRAWBACKS.find(d => d.id === id)!;
    expect(difficultyLevel(selected.difficulty).label).toBe(level.label);
    await expect(page.locator('.drawback-content h3')).toHaveText(selected.name);
  }
});

test('difficulty options and selected badges distinguish all five bands in both themes', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    await page.goto(`/?scoutTheme=${theme}`);
    await page.getByRole('button', { name: /New game/ }).click();
    const colors = new Set<string>();
    for (const label of ['Very easy', 'Easy', 'Medium', 'Hard', 'Very hard']) {
      const drawback = DRAWBACKS.find(d => difficultyLevel(d.difficulty).label === label)!;
      const option = page.locator(`#drawback-choice option[value="${drawback.id}"]`);
      await expect(option).toHaveText(`■ ${drawback.name} · ${label}`);
      await page.locator('#drawback-choice').selectOption(drawback.id);
      await expect(page.locator('.difficulty-badge')).toHaveText(`■ ${label}`);
      const color = await option.evaluate(el => getComputedStyle(el).color);
      await expect(page.locator('.difficulty-badge')).toHaveCSS('color', color);
      colors.add(color);
    }
    expect(colors.size).toBe(5);
    await page.locator('#drawback-choice').selectOption('random');
    await expect(page.locator('.difficulty-badge')).toHaveCount(0);
    await page.getByRole('button', { name: 'Close dialog' }).click();
  }
});

for (const [drawback, sprite, label] of [
  ['blinded-by-the-sun', '.sun-sprite', /sun target/],
  ['active-volcano', '.volcano-sprite', /volcano/],
] as const) {
test(`${drawback} sprite follows its target, flip and reload without exposing it during handoff`, async ({ page }) => {
  const game = newGame(drawback, 'horse', 42);
  const target = game.rules!.params.w.square;
  const name = 'abcdefgh'[target % 8] + (8 - Math.floor(target / 8));
  await page.addInitScript(game => {
    if (!localStorage.getItem('sun-seeded')) {
      localStorage.setItem('drawback-chess-v1', JSON.stringify({
        version: 1, game, mode: 'local', human: 'w', flipped: false, strength: 200,
      }));
      localStorage.setItem('sun-seeded', 'true');
    }
  }, game);
  await page.goto('/');
  await expect(page.locator(sprite)).toHaveCount(0);
  await page.getByRole('button', { name: /I’m the .* player/ }).click();
  await expect(page.locator(`[data-square="${name}"] ${sprite}`)).toHaveCount(1);
  await expect(page.locator(`[data-square="${name}"]`)).toHaveAttribute('aria-label', label);
  if (drawback === 'active-volcano') {
    await expect(page.locator('.volcano-danger')).toHaveCount(4);
    for (const neighbor of [target - 8, target + 8, target - 1, target + 1]) {
      const square = 'abcdefgh'[neighbor % 8] + (8 - Math.floor(neighbor / 8));
      await expect(page.locator(`[data-square="${square}"] .volcano-danger`)).toHaveCount(1);
      await expect(page.locator(`[data-square="${square}"]`)).toHaveAttribute('aria-label', /volcano danger zone/);
    }
  }
  await page.getByRole('button', { name: /Flip board/ }).click();
  await expect(page.locator(`[data-square="${name}"] ${sprite}`)).toHaveCount(1);
  await page.reload();
  await expect(page.locator(sprite)).toHaveCount(0);
  await expect(page.locator('.volcano-danger')).toHaveCount(0);
  await page.getByRole('button', { name: /I’m the .* player/ }).click();
  await expect(page.locator(`[data-square="${name}"] ${sprite}`)).toHaveCount(1);
  await page.locator('[data-square="a2"]').click();
  await page.locator('[data-square="a3"]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator(sprite)).toHaveCount(0);
  await page.getByRole('button', { name: /I’m the .* player/ }).click();
  await expect(page.locator(sprite)).toHaveCount(0);
  await expect(page.locator('.volcano-danger')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reveal White drawback', exact: true }).click();
  await page.getByRole('button', { name: 'Reveal White’s drawback', exact: true }).click();
  await expect(page.locator(`[data-square="${name}"] ${sprite}`)).toHaveCount(1);
});
}

test('secret garden flowers mark both squares, follow flip and reload, and respect privacy', async ({ page }) => {
  const game = newGame('secret-garden', 'secret-garden', 42);
  game.rules!.params.w.square = index('b3');
  game.rules!.params.b.square = index('f6');
  await page.addInitScript(game => {
    if (!localStorage.getItem('garden-seeded')) {
      localStorage.setItem('drawback-chess-v1', JSON.stringify({
        version: 1, game, mode: 'local', human: 'w', flipped: false, strength: 200,
      }));
      localStorage.setItem('garden-seeded', 'true');
    }
  }, game);
  await page.goto('/');
  await expect(page.locator('.garden-sprite')).toHaveCount(0);
  await page.getByRole('button', { name: /I’m the .* player/ }).click();
  const checkWhite = async () => {
    for (const at of ['b3', 'c3']) {
      await expect(page.locator(`[data-square="${at}"] .garden-sprite`)).toHaveCount(1);
      await expect(page.locator(`[data-square="${at}"]`)).toHaveAttribute('aria-label', /secret garden/);
    }
  };
  await checkWhite();
  await expect(page.locator('.garden-sprite')).toHaveCount(2);
  await expect(page.getByRole('status', { name: 'Your move restriction' })).toHaveText('Your secret garden is on b3 and c3.');
  await page.locator('[data-square="b2"]').click();
  await expect(page.locator('[data-square="b3"]')).not.toHaveClass(/legal-square/);
  await page.getByRole('button', { name: /Flip board/ }).click();
  await checkWhite();
  await page.reload();
  await expect(page.locator('.garden-sprite')).toHaveCount(0);
  await page.getByRole('button', { name: /I’m the .* player/ }).click();
  await checkWhite();
  await page.locator('[data-square="a2"]').click();
  await page.locator('[data-square="a4"]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.garden-sprite')).toHaveCount(0);
  await page.getByRole('button', { name: /I’m the .* player/ }).click();
  await expect(page.locator('.garden-sprite')).toHaveCount(2);
  for (const at of ['b3', 'c3']) {
    await expect(page.locator(`[data-square="${at}"]`)).not.toHaveAttribute('aria-label', /secret garden/);
  }
  for (const at of ['f6', 'g6']) await expect(page.locator(`[data-square="${at}"] .garden-sprite`)).toHaveCount(1);
  await expect(page.getByRole('status', { name: 'Your move restriction' })).toHaveText('Your secret garden is on f6 and g6.');
  await page.getByRole('button', { name: 'Reveal White drawback', exact: true }).click();
  await page.getByRole('button', { name: 'Reveal White’s drawback', exact: true }).click();
  await expect(page.locator('.garden-sprite')).toHaveCount(4);
  await checkWhite();
  await page.getByRole('button', { name: 'Resign', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm resignation', exact: true }).click();
  await page.getByRole('button', { name: 'Review board', exact: true }).click();
  await expect(page.locator('.garden-sprite')).toHaveCount(4);
});

test('river markers leave the center clear and follow orientation, reload and reveal privacy', async ({ page }) => {
  const game = newGame('bridge-over-troubled-water', 'horse', 42);
  await page.addInitScript(game => {
    if (!localStorage.getItem('river-seeded')) {
      localStorage.setItem('drawback-chess-v1', JSON.stringify({
        version: 1, game, mode: 'local', human: 'w', flipped: false, strength: 200,
      }));
      localStorage.setItem('river-seeded', 'true');
    }
  }, game);
  await page.goto('/');
  await expect(page.locator('.river-overlay, .bridge-overlay')).toHaveCount(0);
  await page.getByRole('button', { name: /I’m the .* player/ }).click();
  const checkTerrain = async () => {
    await expect(page.locator('.river-overlay')).toHaveCount(12);
    await expect(page.locator('.bridge-overlay')).toHaveCount(0);
    for (const rank of [4, 5]) {
      for (const file of 'abcdefgh') {
        const cell = page.locator(`[data-square="${file}${rank}"]`);
        await expect(cell.locator('.river-overlay')).toHaveCount('de'.includes(file) ? 0 : 1);
        if ('de'.includes(file)) await expect(cell).not.toHaveAttribute('aria-label', /river|bridge/);
        else await expect(cell).toHaveAttribute('aria-label', /river/);
      }
    }
  };
  await checkTerrain();
  await page.getByRole('button', { name: /Flip board/ }).click();
  await checkTerrain();
  await page.goto('/?scoutTheme=dark');
  await expect(page.locator('.river-overlay, .bridge-overlay')).toHaveCount(0);
  await page.getByRole('button', { name: /I’m the .* player/ }).click();
  await checkTerrain();
  await page.locator('[data-square="c2"]').click();
  await expect(page.locator('[data-square="c4"]')).not.toHaveAttribute('aria-label', /legal destination/);
  await page.locator('[data-square="d2"]').click();
  await expect(page.locator('[data-square="d4"]')).toHaveAttribute('aria-label', /legal destination/);
  await page.locator('[data-square="d4"]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem('drawback-chess-v1')!).game.history.at(-1)?.move.to)).toBe(index('d4'));
  await expect(page.locator('.river-overlay, .bridge-overlay')).toHaveCount(0);
  await page.getByRole('button', { name: /I’m the .* player/ }).click();
  await expect(page.locator('.river-overlay, .bridge-overlay')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reveal White drawback', exact: true }).click();
  await page.getByRole('button', { name: 'Reveal White’s drawback', exact: true }).click();
  await checkTerrain();
});

test('all glossary drawbacks can be selected and a parameterized rule survives reload', async ({ page }) => {
  const game = newGame('crusade', 'horse', 12345);
  await page.addInitScript(game => {
    if (!localStorage.getItem('glossary-seeded')) {
      localStorage.setItem('drawback-chess-v1', JSON.stringify({
        version: 1, game, mode: 'local', human: 'w', flipped: false, strength: 200,
      }));
      localStorage.setItem('glossary-seeded', 'true');
    }
  }, game);
  await page.goto('/');
  await page.getByRole('button', { name: /I’m the .* player/ }).click();
  await expect(page.locator('.drawback-content')).toContainText(drawbackDescription(game, 'w'));
  await expect(page.locator('.drawback-content')).not.toContainText('$');
  await page.reload();
  await page.getByRole('button', { name: /I’m the .* player/ }).click();
  await expect(page.locator('.drawback-content')).toContainText(drawbackDescription(game, 'w'));
  await page.getByRole('button', { name: /New game/ }).click();
  await expect(page.locator('#drawback-choice option')).toHaveCount(187);
  await page.locator('#drawback-choice').selectOption('vegan');
  await page.getByRole('button', { name: /Start game|Let’s play|Start playing/ }).click();
  await page.getByRole('button', { name: /I’m the .* player/ }).click();
  await expect(page.locator('.drawback-content')).toContainText('Vegan');
  await page.getByRole('button', { name: /The drawbacks/ }).click();
  await page.getByRole('searchbox', { name: 'Find a drawback' }).fill('vegan');
  await expect(page.locator('.glossary article')).toHaveCount(1);
  await expect(page.locator('.glossary article')).toContainText("You can't capture knights");
});

test('Ichthyophobe prepares a real engine restriction for a human and keeps it after reload', async ({ page }) => {
  const game = newGame('ichthyophobe', 'horse', 12345);
  await page.addInitScript(game => {
    if (!localStorage.getItem('ichthyophobe-seeded')) {
      localStorage.setItem('drawback-chess-v1', JSON.stringify({
        version: 1, game, mode: 'ai', human: 'w', flipped: false, strength: 200,
      }));
      localStorage.setItem('ichthyophobe-seeded', 'true');
    }
  }, game);
  await page.goto('/');
  await expect(page.locator('.move-info')).toContainText('Cannot play', { timeout: 20000 });
  const forbidden = await page.evaluate((): string =>
    JSON.parse(localStorage.getItem('drawback-chess-v1')!).game.rules.engineBans[0]);
  expect(forbidden).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
  await expect(page.locator('.engine-note')).toContainText('Ichthyophobe · Stockfish');
  await page.locator(`[data-square="${forbidden.slice(0, 2)}"]`).click();
  await expect(page.locator(`[data-square="${forbidden.slice(2, 4)}"]`)).not.toHaveClass(/legal-square/);
  await page.reload();
  await expect(page.locator('.move-info')).toContainText(`${forbidden.slice(0, 2)}–${forbidden.slice(2, 4)}${forbidden.slice(4)}`);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('new capture rules enforce both highlighted moves and submitted moves', async ({ page }) => {
  const game = newGame('vegan', 'horse', 55);
  game.board.fill(null);
  game.board[index('e1')] = { color: 'w', kind: 'k' };
  game.board[index('e8')] = { color: 'b', kind: 'k' };
  game.board[index('a1')] = { color: 'w', kind: 'r' };
  game.board[index('a4')] = { color: 'b', kind: 'n' };
  game.rights.w = { king: false, queen: false };
  await page.addInitScript(game => {
    localStorage.setItem('drawback-chess-v1', JSON.stringify({
      version: 1, game, mode: 'local', human: 'w', flipped: false, strength: 200,
    }));
  }, game);
  await page.goto('/');
  await page.getByRole('button', { name: /I’m the .* player/ }).click();
  await page.locator('[data-square="a1"]').click();
  await expect(page.locator('[data-square="a3"]')).toHaveClass(/legal-square/);
  await expect(page.locator('[data-square="a4"]')).not.toHaveClass(/legal-square/);
  await page.locator('[data-square="a4"]').click();
  await expect(page.locator('[data-square="a4"]')).toHaveAttribute('aria-label', /Black knight/);
  await expect(page.locator('.move-history')).toContainText('Your moves will appear here');
});
