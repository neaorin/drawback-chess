import { describe, expect, it } from 'vitest';
import { finishRepetition, index, legalMoves, newGame, play, positionAt, positionKey, repetitionCount, restoreRepetitions, transition, type Game } from './game';

const cycle = [['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8']] as const;
function moves(g: Game, sequence = cycle): Game {
  for (const [from, to] of sequence) g = play(g, { from: index(from), to: index(to) });
  return g;
}

describe('board-based position strings', () => {
  it('uses board, side, castling rights, normalized en passant and special king rights', () => {
    const g = newGame('horse', 'horse', 42);
    expect(positionKey(g)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - | kp:-');
    expect(positionKey({ ...g, turn: 'b' })).not.toBe(positionKey(g));
    expect(positionKey({ ...g, rights: { ...g.rights, w: { king: false, queen: true } } })).not.toBe(positionKey(g));
    const changed = structuredClone(g);
    changed.board[index('a2')] = null;
    expect(positionKey(changed)).not.toBe(positionKey(g));
  });

  it('ignores reveal status, drawbacks, move counters and rule memory', () => {
    const g = newGame('horse', 'horse', 42);
    const changed = structuredClone(g);
    changed.drawbacks.w = 'even';
    changed.revealed.w = true;
    changed.turns.w = 100;
    changed.lastPawn.w = true;
    changed.lastKingTurn.w = 98;
    changed.rules!.players.w.checks = 5;
    changed.rules!.pieces[62].frozen = true;
    expect(positionKey(changed)).toBe(positionKey(g));
  });

  it('ignores unusable pawn en passant but includes geometrically available captures regardless of drawback', () => {
    let g = newGame('even', 'horse', 42);
    g = play(g, { from: index('e2'), to: index('e4') });
    expect(positionKey(g)).toBe(positionKey({ ...g, ep: null }));
    g.board[index('e4')] = null;
    g.board[index('e5')] = { color: 'w', kind: 'p' };
    g.board[index('d5')] = { color: 'b', kind: 'p' };
    g.turn = 'w';
    g.turns.w = 0; // Even Keeled cannot capture, but this policy ignores that restriction.
    g.ep = index('d6');
    expect(legalMoves(g).some(m => m.to === g.ep && m.capture !== undefined)).toBe(false);
    expect(positionKey(g)).toContain(' d6 |');
    expect(positionKey(g)).not.toBe(positionKey({ ...g, ep: null }));
  });

  it('normalizes special king-capture square ordering without mutating it', () => {
    const g = newGame('horse', 'horse', 42);
    g.kingPass = { color: 'w', king: index('g1'), squares: [index('f1'), index('e1')] };
    expect(positionKey(g)).toContain('kp:w:g1:e1,f1');
    expect(positionKey(g)).toBe(positionKey({ ...g, kingPass: { ...g.kingPass, squares: [...g.kingPass.squares].reverse() } }));
    expect(g.kingPass.squares).toEqual([index('f1'), index('e1')]);
    expect(positionKey(g)).not.toBe(positionKey({ ...g, kingPass: null }));
  });
});

describe('repetition outcomes and history', () => {
  it('counts the initial position and ends the third non-consecutive occurrence', () => {
    const initial = newGame('horse', 'horse', 42);
    expect(repetitionCount(initial)).toBe(1);
    const second = moves(initial);
    expect(repetitionCount(second)).toBe(2);
    expect(second.result).toBeNull();
    const third = moves(second);
    expect(repetitionCount(third)).toBe(3);
    expect(third.result).toEqual({ winner: null, reason: 'Threefold repetition' });
    expect(legalMoves(third)).toEqual([]);
    expect(() => play(third, { from: index('e2'), to: index('e4') })).toThrow('not legal');
    expect(repetitionCount(initial)).toBe(1);
    expect(repetitionCount(second)).toBe(2);
    expect(positionAt(third, 4).repetitions).toEqual(second.repetitions);
    expect(positionAt(third, 4).result).toBeNull();
    expect(positionAt(third, 0).repetitions).toEqual(initial.repetitions);
  });

  it('tracks search transitions without altering the parent counts', () => {
    let g = moves(newGame('horse', 'horse', 42));
    for (const [from, to] of cycle.slice(0, 3)) g = play(g, { from: index(from), to: index(to) });
    const before = JSON.stringify(g);
    const next = transition(g, legalMoves(g).find(m => m.from === index('f6') && m.to === index('g8'))!, false);
    expect(next.result?.winner).toBeNull();
    expect(repetitionCount(next)).toBe(3);
    expect(JSON.stringify(g)).toBe(before);
  });

  it('preserves a decisive loss even when repetition would also draw', () => {
    const g = newGame('horse', 'horse', 42);
    g.board.fill(null);
    g.board[index('e1')] = { color: 'w', kind: 'k' };
    g.board[index('e2')] = { color: 'b', kind: 'k' };
    const move = legalMoves(g).find(m => m.to === index('e2'))!;
    const key = positionKey(transition(g, move));
    g.repetitions = { [positionKey(g)]: 1, [key]: 2 };
    const next = play(g, move);
    expect(repetitionCount(next)).toBe(3);
    expect(next.result).toEqual({ winner: 'w', reason: 'King captured' });
    expect(finishRepetition({ ...next, result: { winner: 'b', reason: 'No legal moves' } }).result?.winner).toBe('b');
  });

  it('waits for an engine ban before declaring a draw', () => {
    const g = newGame('horse', 'ichthyophobe', 42);
    const next = play(g, { from: index('g1'), to: index('f3') });
    next.repetitions = { [positionKey(next)]: 3 };
    expect(finishRepetition(next).result).toBeNull();
    next.rules!.engineBans[1] = 'g8f6';
    expect(finishRepetition(next).result).toEqual({ winner: null, reason: 'Threefold repetition' });
  });

  it('no legal moves take precedence in live play and search', () => {
    const g = newGame('alternator', 'horse', 42);
    g.board.fill(null);
    g.board[index('e1')] = { color: 'w', kind: 'k' };
    g.board[index('e8')] = { color: 'b', kind: 'k' };
    g.turn = 'b';
    g.lastPawn.w = false;
    const move = legalMoves(g).find(m => m.to === index('d8'))!;
    g.repetitions = { [positionKey(transition(g, move))]: 2 };
    for (const finish of [false, true]) {
      expect(transition(g, move, finish).result).toEqual({ winner: 'b', reason: 'White has no legal moves' });
    }
  });

  it('rebuilds missing counts from legacy history and preserves completed results', () => {
    const g = moves(moves(newGame('horse', 'horse', 42)));
    const expected = g.repetitions;
    delete g.repetitions;
    g.result = null;
    const restored = restoreRepetitions(g);
    expect(restored.repetitions).toEqual(expected);
    expect(restored.result).toEqual({ winner: null, reason: 'Threefold repetition' });
    g.result = { winner: 'b', reason: 'White resigned' };
    expect(restoreRepetitions(g).result).toEqual(g.result);
  });

  it('initializes custom empty-history and legacy no-rule-state saves', () => {
    const g = newGame('horse', 'horse', 42);
    g.board[index('a2')] = null;
    delete g.repetitions;
    delete g.rules;
    expect(restoreRepetitions(g).repetitions).toEqual({ [positionKey(g)]: 1 });
  });

  it('can review old games that continued beyond the new draw threshold', () => {
    let g = newGame('horse', 'horse', 42);
    for (let i = 0; i < 3; i++) {
      for (const [from, to] of cycle) g = play({ ...g, result: null }, { from: index(from), to: index(to) });
    }
    g.result = { winner: 'b', reason: 'White resigned' };
    delete g.repetitions;
    g = restoreRepetitions(g);
    expect(repetitionCount(g)).toBe(4);
    expect(positionAt(g, 10).history).toHaveLength(10);
    expect(positionAt(g, 10).board[index('f3')]).toEqual({ color: 'w', kind: 'n' });
    expect(g.result).toEqual({ winner: 'b', reason: 'White resigned' });
  });
});
