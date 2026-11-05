import { describe, expect, it } from 'vitest';
import { DRAWBACKS, index, legalMoves, newGame, play, positionAt, pseudoMoves, type Color, type DrawbackId, type Game, type Kind } from './game';
import { drawbackLoss, LOSS_IDS } from './drawback-losses';
import { initialRules, movementKind, needsEngineBan, parameterDescription, rulesFor } from './drawback-state';
import { isSaved } from './storage';

function fixture(id: DrawbackId, pieces: Record<string, `${Color}${Kind}`> = {}, turn: Color = 'w'): Game {
  const g = newGame(id, 'horse', 1234);
  g.board.fill(null);
  for (const [at, text] of Object.entries({ e1: 'wk', e8: 'bk', ...pieces })) {
    g.board[index(at)] = { color: text[0] as Color, kind: text[1] as Kind };
  }
  g.turn = turn;
  g.rights = { w: { king: false, queen: false }, b: { king: false, queen: false } };
  g.rules = initialRules(g, 1234);
  return g;
}

describe('drawback loss conditions', () => {
  it.each([
    ['abstinence', { a7: 'bn', b6: 'bn' }],
    ['always-check-it-might-be-mate', { e7: 'br' }],
    ['boastful', { a7: 'bp' }],
    ['edgelord', { a7: 'br' }],
    ['ivory-tower', { d2: 'bn' }],
    ['modest', { a2: 'wp' }],
    ['pawn-battle', { a7: 'bp' }],
    ['paranoid', {}],
    ['simp', {}],
    ['tower-defense', {}],
  ] as const)('%s triggers on its board condition', (id, pieces) => {
    const g = fixture(id, pieces);
    expect(drawbackLoss(g, 'w')).not.toBeNull();
    g.drawbacks.w = 'horse';
    expect(drawbackLoss(g, 'w')).toBeNull();
  });

  it.each([
    ['castle', 'r'], ['my-kingdom-for-a-horse', 'n'], ['drag', 'q'], ['body-snatcher', 'b'],
  ] as const)('%s loses only for its relevant enemy capture', (id, victim) => {
    const g = fixture(id);
    g.rules!.events.push({ color: 'b', from: 0, to: 8, capture: 8, kind: victim, captured: victim, pieceId: 0 });
    expect(drawbackLoss(g, 'w')).not.toBeNull();
    g.rules!.events[0].captured = 'p';
    expect(drawbackLoss(g, 'w')).toBeNull();
  });

  it('distinguishes capture adjacency, garden trampling, and invasion', () => {
    const g = fixture('atomic-bomb');
    g.rules!.events.push({ color: 'b', from: index('a8'), to: index('d2'), capture: index('d2'), kind: 'r', captured: 'p', pieceId: 0 });
    expect(drawbackLoss(g, 'w')).not.toBeNull();
    g.rules!.events[0].capture = index('d3');
    expect(drawbackLoss(g, 'w')).toBeNull();
    g.drawbacks.w = 'secret-garden';
    g.rules!.params.w.square = index('d2');
    expect(drawbackLoss(g, 'w')).not.toBeNull();
    g.drawbacks.w = 'homeland-security';
    expect(drawbackLoss(g, 'w')).not.toBeNull();
    g.drawbacks.w = 'hold-them-back';
    expect(drawbackLoss(g, 'w')).toBeNull();
    g.rules!.events[0].kind = 'p';
    expect(drawbackLoss(g, 'w')).not.toBeNull();
  });

  it.each(['botez-gambit', 'moving-day', 'king-of-the-hill', 'closed-book', 'warlord'] as const)(
    '%s observes start-of-turn timing', id => {
      const g = fixture(id);
      g.turns.w = id === 'botez-gambit' ? 10 : id === 'warlord' ? 11 : 20;
      expect(drawbackLoss(g, 'w')).not.toBeNull();
      g.turn = 'b';
      expect(drawbackLoss(g, 'w')).toBeNull();
    },
  );

  it.each(['fischer-random', 'rook-on-the-seventh', 'siege', 'inching-forward'] as const)(
    '%s enforces its deadline, not the preceding move', id => {
      const g = fixture(id);
      const deadline = id === 'inching-forward' ? 6 : id === 'rook-on-the-seventh' ? 15 : 20;
      g.turns.w = deadline - 1;
      expect(drawbackLoss(g, 'w')).toBeNull();
      g.turns.w = deadline;
      expect(drawbackLoss(g, 'w')).not.toBeNull();
    },
  );

  it('records completed objectives and counts checks, captures and distance', () => {
    const g = fixture('fischer-random');
    g.turns.w = 20;
    g.rules!.players.w.achieved.push('fischer-random');
    expect(drawbackLoss(g, 'w')).toBeNull();
    g.drawbacks.w = 'three-check';
    g.rules!.players.w.checks = 2;
    expect(drawbackLoss(g, 'w')).toBeNull();
    g.rules!.players.w.checks = 3;
    expect(drawbackLoss(g, 'w')).not.toBeNull();
    g.drawbacks.w = 'octomom';
    g.rules!.events = Array.from({ length: 8 }, () => ({
      color: 'b', from: 0, to: 8, capture: 8, kind: 'r', captured: 'p', pieceId: 0,
    }));
    expect(drawbackLoss(g, 'w')).not.toBeNull();
    g.drawbacks.w = 'unspooling';
    g.rules!.events = Array.from({ length: 10 }, () => ({
      color: 'w', from: 0, to: 45, kind: 'q', pieceId: 0,
    }));
    expect(drawbackLoss(g, 'w')).not.toBeNull();
  });

  it('checks Crusade only at the end of the four required personal turns', () => {
    const g = fixture('crusade');
    g.rules!.params.w.move = 6;
    g.turns.w = 6;
    expect(drawbackLoss(g, 'w')).toBeNull();
    g.rules!.events.push({ color: 'w', from: 60, to: 52, kind: 'k', pieceId: 60 });
    expect(drawbackLoss(g, 'w')).not.toBeNull();
    g.board[g.rules!.params.w.square] = { color: 'w', kind: 'p' };
    expect(drawbackLoss(g, 'w')).toBeNull();
  });

  it('awards the opponent a win when the mover violates a material condition', () => {
    const g = fixture('modest', { a1: 'wr', a7: 'bp' });
    const next = play(g, { from: index('a1'), to: index('a7') });
    expect(next.result).toEqual({ winner: 'b', reason: expect.stringContaining('Modest') });
    expect(g.rules!.events).toEqual([]);
  });
});

describe('persistent rule state', () => {
  it('selects only c4-f4 and c5-f5 volcano targets for both colors', () => {
    const seen = { w: new Set<number>(), b: new Set<number>() };
    const allowed = ['c4', 'd4', 'e4', 'f4', 'c5', 'd5', 'e5', 'f5'].map(index);
    for (let seed = 0; seed < 100; seed++) {
      const g = newGame('active-volcano', 'active-volcano', seed);
      for (const color of ['w', 'b'] as const) {
        const target = rulesFor(g).params[color].square;
        expect(allowed).toContain(target);
        seen[color].add(target);
      }
    }
    expect(seen.w.size).toBe(8);
    expect(seen.b.size).toBe(8);
  });
  it('selects only the four central sun targets for both colors', () => {
    const seen = { w: new Set<number>(), b: new Set<number>() };
    for (let seed = 0; seed < 100; seed++) {
      const g = newGame('blinded-by-the-sun', 'blinded-by-the-sun', seed);
      for (const color of ['w', 'b'] as const) {
        const target = rulesFor(g).params[color].square;
        expect(['d4', 'd5', 'e4', 'e5'].map(index)).toContain(target);
        seen[color].add(target);
      }
    }
    expect(seen.w.size).toBe(4);
    expect(seen.b.size).toBe(4);
  });

  it('replays randomness, identity and per-turn state exactly', () => {
    let g = newGame('colorblind', 'horse', 98765);
    const snapshots = [g];
    for (let i = 0; i < 10 && !g.result; i++) {
      g = play(g, legalMoves(g)[0]);
      snapshots.push(g);
    }
    for (let i = 0; i < snapshots.length; i++) {
      expect(positionAt(g, i).rules).toEqual(snapshots[i].rules);
    }
    const saved = { version: 1, game: g, mode: 'local', human: 'w', flipped: false, strength: 400 };
    expect(isSaved(JSON.parse(JSON.stringify(saved)))).toBe(true);
    Reflect.set(g.rules!, 'players', {});
    expect(isSaved(saved)).toBe(false);
  });

  it('keeps legacy saves compatible but requires state for new drawbacks', () => {
    const g = newGame('horse', 'cess');
    delete g.rules;
    const saved = { version: 1, game: g, mode: 'local', human: 'w', flipped: false, strength: 400 };
    expect(isSaved(saved)).toBe(true);
    g.drawbacks.w = 'colorblind';
    expect(isSaved(saved)).toBe(false);
  });

  it('uses a stable, concrete parameter description with no placeholders', () => {
    const g = newGame('crusade', 'secret-garden', 12);
    const description = parameterDescription(g, 'w', 'Turn $MOVE: $HOLY_LAND; $COLOR $RANK $PARITY $PIECE');
    expect(description).not.toContain('$');
    expect(description).toBe(parameterDescription(g, 'w', 'Turn $MOVE: $HOLY_LAND; $COLOR $RANK $PARITY $PIECE'));
    expect(Math.floor(rulesFor(g).params.b.square / 8)).toBe(2);
  });

  it('changes queen geometry without changing piece identity', () => {
    const g = fixture('drag', { d4: 'wq' });
    expect(pseudoMoves(g).filter(m => m.from === index('d4'))).toHaveLength(8);
    g.drawbacks.w = 'shapeshifter';
    expect(movementKind(g, index('d4'))).toBe('b');
    g.rules!.players.w.shape = 'n';
    expect(pseudoMoves(g).filter(m => m.from === index('d4'))).toHaveLength(0);
    g.rules!.players.w.shape = 'r';
    expect(pseudoMoves(g).filter(m => m.from === index('d4'))).toHaveLength(14);
  });

  it('holds Ichthyophobe until its engine-selected forbidden move is ready', () => {
    const g = newGame('ichthyophobe', 'horse', 12);
    expect(needsEngineBan(g)).toBe(true);
    expect(legalMoves(g)).toEqual([]);
    g.rules!.engineBans[0] = 'e2e4';
    expect(needsEngineBan(g)).toBe(false);
    expect(legalMoves(g)).toHaveLength(19);
    expect(legalMoves(g).some(m => m.from === index('e2') && m.to === index('e4'))).toBe(false);
  });

  it('includes explicit loss handling for the complete loss catalogue', () => {
    expect(new Set(LOSS_IDS).size).toBe(LOSS_IDS.length);
    for (const id of LOSS_IDS) expect(DRAWBACKS.some(d => d.id === id)).toBe(true);
  });
});
