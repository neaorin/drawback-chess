import { describe, expect, it } from 'vitest';
import { drawbackMoveInfo, index, legalMoves, newGame, other, play, positionAt, restoreRepetitions, square } from '../src/game';
import { secretGardenSquares } from '../src/drawback-helpers';
import { initialRules } from '../src/drawback-state';
import { isSaved } from '../src/storage';

describe('Secret Garden', () => {
  it.each(['w', 'b'] as const)('assigns stable random adjacent squares on the correct rank for %s', color => {
    const pairs = new Set<string>();
    for (let seed = 0; seed < 100; seed++) {
      const g = newGame('secret-garden', 'secret-garden', seed);
      const anchor = g.rules!.params[color].square;
      const garden = secretGardenSquares(anchor);
      expect(garden).toEqual([anchor, anchor + 1]);
      expect(garden.map(at => square(at)[1])).toEqual(color === 'w' ? ['3', '3'] : ['6', '6']);
      expect(anchor % 8).toBeLessThan(7);
      expect(newGame('secret-garden', 'secret-garden', seed).rules!.params[color].square).toBe(anchor);
      pairs.add(garden.map(square).join(','));
      g.turn = color;
      expect(drawbackMoveInfo(g)).toBe(`Your secret garden is on ${garden.map(square).join(' and ')}.`);
      expect(isSaved(JSON.parse(JSON.stringify({
        version: 1, game: g, mode: 'local', human: 'w', flipped: false, strength: 200,
      })))).toBe(true);
    }
    expect(pairs.size).toBe(7);
  });

  it.each(['w', 'b'] as const)('enforces both garden squares for %s and allows other squares', color => {
    const rank = color === 'w' ? '3' : '6';
    const home = color === 'w' ? '2' : '7';
    for (const file of ['b', 'c']) {
      const g = newGame('secret-garden', 'secret-garden', 42);
      g.rules!.params[color].square = index(`b${rank}`);
      g.turn = color;
      expect(legalMoves(g).some(m => m.from === index(`${file}${home}`) && m.to === index(`${file}${rank}`))).toBe(false);
      expect(legalMoves(g).some(m => m.from === index(`a${home}`) && m.to === index(`a${rank}`))).toBe(true);

      g.board.fill(null);
      g.board[index('h1')] = { color: 'w', kind: 'k' };
      g.board[index('h8')] = { color: 'b', kind: 'k' };
      g.board[index(`${file}4`)] = { color: other(color), kind: 'r' };
      g.turn = other(color);
      g.rules = initialRules(g, 42);
      g.rules.params[color].square = index(`b${rank}`);
      const next = play(g, { from: index(`${file}4`), to: index(`${file}${rank}`) });
      expect(next.result?.winner).toBe(other(color));
      expect(next.result?.reason).toContain('Secret Garden');
    }
  });

  it('retains the assigned pair throughout play and historical replay', () => {
    let g = newGame('secret-garden', 'secret-garden', 42);
    const params = structuredClone(g.rules!.params);
    g = play(g, { from: index('a2'), to: index('a4') });
    g = play(g, { from: index('a7'), to: index('a5') });
    expect(g.rules!.params).toEqual(params);
    expect(positionAt(g, 1).rules!.params).toEqual(params);
  });

  it.each(['3', '6'])('expands old h-file garden anchors without crossing rank %s', rank => {
    expect(secretGardenSquares(index(`h${rank}`))).toEqual([index(`g${rank}`), index(`h${rank}`)]);
    expect(secretGardenSquares(index(`a${rank}`))).toEqual([index(`a${rank}`), index(`b${rank}`)]);
  });

  it('uses saved garden anchors rather than regenerating them during replay and legacy migration', () => {
    let g = newGame('secret-garden', 'secret-garden', 42);
    g.rules!.params.w.square = index('h3');
    g.rules!.params.b.square = index('h6');
    g = play(g, { from: index('b2'), to: index('b3') });
    g = play(g, { from: index('b7'), to: index('b6') });
    const earlier = positionAt(g, 1);
    expect(earlier.rules!.params.w.square).toBe(index('h3'));
    expect(drawbackMoveInfo({ ...earlier, turn: 'w' })).toBe('Your secret garden is on g3 and h3.');
    const counts = g.repetitions;
    delete g.repetitions;
    const restored = restoreRepetitions(g);
    expect(restored.repetitions).toEqual(counts);
    expect(restored.rules!.params).toEqual(g.rules!.params);
    expect(restored.result).toBeNull();
  });
});
