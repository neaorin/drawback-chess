import { describe, expect, it } from 'vitest';
import { DRAWBACKS, attackedKings, drawbackMoveInfo, fen, index, legalMoves, newGame, play, pseudoMoves, square, uci, type Color, type DrawbackId, type Game, type Kind } from './game';

function position(pieces: Record<string, `${Color}${Kind}`>, drawback: DrawbackId | null = null, turn: Color = 'w'): Game {
  const g = newGame('horse', 'horse');
  g.board.fill(null);
  for (const [at, p] of Object.entries(pieces)) g.board[index(at)] = { color: p[0] as Color, kind: p[1] as Kind };
  g.turn = turn;
  g.drawbacks = { w: turn === 'w' ? drawback : null, b: turn === 'b' ? drawback : null };
  g.rights = { w: { king: false, queen: false }, b: { king: false, queen: false } };
  return g;
}
function move(g: Game, from: string, to: string, promotion?: 'q' | 'r' | 'b' | 'n') {
  return play(g, { from: index(from), to: index(to), promotion });
}
const has = (g: Game, from: string, to: string) => legalMoves(g).some(m => m.from === index(from) && m.to === index(to));

describe('king attack warnings', () => {
  it('does not highlight safe kings or attacks blocked by pieces', () => {
    expect(attackedKings(newGame())).toEqual(new Set());
    expect(attackedKings(position({ e1: 'wk', e2: 'wp', e8: 'br', a8: 'bk' }))).toEqual(new Set());
  });
  it.each([
    ['e8', 'br'], ['b4', 'bb'], ['f3', 'bn'], ['d2', 'bp'], ['e2', 'bk'],
  ] as const)('detects an attack by %s %s', (at, piece) => {
    expect(attackedKings(position({ e1: 'wk', [at]: piece })).has(index('e1'))).toBe(true);
  });
  it('does not treat a pawn forward move as an attack', () => {
    expect(attackedKings(position({ e1: 'wk', e2: 'bp' }))).toEqual(new Set());
  });
  it('detects both adjacent kings, regardless of the turn', () => {
    expect(attackedKings(position({ e1: 'wk', e2: 'bk' }))).toEqual(new Set([index('e1'), index('e2')]));
  });
  it('ignores drawbacks without changing legal moves', () => {
    const g = position({ e1: 'wk', f3: 'bn', a8: 'bk' }, 'horse', 'b');
    const before = legalMoves(g);
    expect(attackedKings(g).has(index('e1'))).toBe(true);
    expect(has(g, 'f3', 'e1')).toBe(false);
    expect(legalMoves(g)).toEqual(before);
  });
  it('detects king en passant on a vulnerable castling path', () => {
    const g = position({ e1: 'wk', h1: 'wr', e8: 'br', a8: 'bk' });
    g.rights.w.king = true;
    expect(attackedKings(move(g, 'e1', 'g1')).has(index('g1'))).toBe(true);
  });
});

describe('before-move drawback information', () => {
  it.each(['w', 'b'] as const)('Centralized Command status matches capture legality for %s throughout the window', color => {
    const g = position({ e1: 'wk', h8: 'bk', a1: `${color}r`, a8: `${color === 'w' ? 'b' : 'w'}r` }, 'command', color);
    expect(drawbackMoveInfo(g)).toContain('Cannot capture.');
    g.lastKingTurn[color] = 2;
    for (const [completed, remaining] of [[2, 3], [3, 2], [4, 1], [5, 0], [6, 0]]) {
      g.turns[color] = completed;
      expect(has(g, 'a1', 'a8')).toBe(remaining > 0);
      expect(drawbackMoveInfo(g)).toContain(remaining > 0
        ? `Can capture for the next ${remaining} ${remaining === 1 ? 'move' : 'moves'}.`
        : 'Cannot capture.');
    }
  });
  it.each(['w', 'b'] as const)('Even Keeled status uses personal turn parity for %s', color => {
    const g = position({ e1: 'wk', h8: 'bk', a1: `${color}r`, a8: `${color === 'w' ? 'b' : 'w'}r` }, 'even', color);
    for (let completed = 0; completed < 4; completed++) {
      g.turns[color] = completed;
      expect(drawbackMoveInfo(g)).toBe(completed % 2 === 0
        ? 'Cannot capture.'
        : 'Can capture.');
    }
  });
  it.each(['w', 'b'] as const)('Alternator status reflects the previous personal move for %s', color => {
    const g = position({ e1: 'wk', h8: 'bk' }, 'alternator', color);
    expect(drawbackMoveInfo(g)).toBeNull();
    g.lastPawn[color] = true;
    expect(drawbackMoveInfo(g)).toBe('Must move a non-pawn.');
    g.lastPawn[color] = false;
    expect(drawbackMoveInfo(g)).toBe('Must move a pawn.');
  });
  it.each(['w', 'b'] as const)('Oddball only shows Cannot capture on even personal moves for %s', color => {
    const g = position({ e1: 'wk', h8: 'bk', a1: `${color}r`, a8: `${color === 'w' ? 'b' : 'w'}r` }, 'oddball', color);
    for (let completed = 0; completed < 4; completed++) {
      g.turns[color] = completed;
      expect(drawbackMoveInfo(g)).toBe(completed % 2 === 1 ? 'Cannot capture.' : null);
      expect(has(g, 'a1', 'a8')).toBe(completed % 2 === 0);
      expect(drawbackMoveInfo(g, color === 'w' ? 'b' : 'w')).toBeNull();
    }
    g.result = { winner: color, reason: 'King captured' };
    expect(drawbackMoveInfo(g)).toBeNull();
  });
  it('omits unsupported, off-turn and finished-game statuses', () => {
    const g = newGame('horse', 'command');
    expect(drawbackMoveInfo(g)).toBeNull();
    expect(drawbackMoveInfo(g, 'b')).toBeNull();
    g.drawbacks.w = 'even';
    g.result = { winner: 'w', reason: 'King captured' };
    expect(drawbackMoveInfo(g)).toBeNull();
  });
});

describe('piece geometry and king-capture variant', () => {
  it('starts with the usual 20 moves and serializes the starting FEN', () => {
    const g = newGame('horse', 'castle');
    expect(legalMoves(g)).toHaveLength(20);
    expect(fen(g)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  });
  it('converts every square round-trip', () => {
    for (let i = 0; i < 64; i++) expect(index(square(i))).toBe(i);
    expect(() => index('z9')).toThrow('Invalid square');
  });
  it('does not wrap knights around the board edge or slide through pieces', () => {
    const g = position({ a1: 'wn', h8: 'bk', c2: 'wp', e1: 'wk', d4: 'wr', d5: 'wp' });
    expect(legalMoves(g).filter(m => m.from === index('a1')).map(m => square(m.to))).toEqual(['b3']);
    expect(has(g, 'd4', 'd6')).toBe(false);
    expect(has(g, 'd4', 'd5')).toBe(false);
  });
  it('allows pinned pieces to move and the king to ignore check', () => {
    const g = position({ e1: 'wk', e2: 'wr', e8: 'br', a8: 'bk' });
    expect(has(g, 'e2', 'd2')).toBe(true);
    const checked = position({ e1: 'wk', a2: 'wp', e8: 'br', a8: 'bk' });
    expect(has(checked, 'a2', 'a3')).toBe(true);
    expect(has(checked, 'e1', 'e2')).toBe(true);
  });
  it('allows adjacent kings and actual king capture', () => {
    let g = position({ e1: 'wk', e3: 'bk' });
    g = move(g, 'e1', 'e2');
    expect(has(g, 'e3', 'e2')).toBe(true);
    g = move(g, 'e3', 'e2');
    expect(g.result).toEqual({ winner: 'b', reason: 'King captured' });
    expect(legalMoves(g)).toEqual([]);
    expect(() => move(g, 'e2', 'e3')).toThrow();
  });
  it('rejects illegal moves without mutating state', () => {
    const g = newGame();
    const before = JSON.stringify(g);
    expect(() => move(g, 'a1', 'a5')).toThrow();
    expect(JSON.stringify(g)).toBe(before);
  });
  it('provides all four promotions and requires a choice', () => {
    const g = position({ a7: 'wp', e1: 'wk', h8: 'bk' });
    expect(legalMoves(g).filter(m => m.from === index('a7')).map(m => m.promotion)).toEqual(['q', 'r', 'b', 'n']);
    expect(() => move(g, 'a7', 'a8')).toThrow();
    expect(move(g, 'a7', 'a8', 'n').board[index('a8')]?.kind).toBe('n');
  });
  it('allows diagonal capture promotion', () => {
    const g = position({ a7: 'wp', b8: 'br', h1: 'wk', h8: 'bk' });
    const next = move(g, 'a7', 'b8', 'q');
    expect(next.board[index('b8')]).toEqual({ color: 'w', kind: 'q' });
  });
});

describe('drawbacks', () => {
  it('has 181 distinct definitions', () => expect(new Set(DRAWBACKS.map(d => d.id)).size).toBe(181));
  it('Castle Doctrine loses immediately on rook capture, not merely a threat', () => {
    const g = position({ e1: 'wk', h8: 'bk', a1: 'wr', a8: 'br' }, 'castle');
    g.turn = 'b';
    const next = move(g, 'a8', 'a1');
    expect(next.result).toEqual({ winner: 'b', reason: 'Castle Doctrine: a rook was captured' });
    expect(g.result).toBeNull();
  });
  it('Castle Doctrine also applies to a newly promoted rook', () => {
    let g = position({ e1: 'wk', h8: 'bk', a7: 'wp', b8: 'br' }, 'castle');
    g = move(g, 'a7', 'a8', 'r');
    expect(move(g, 'b8', 'a8').result?.winner).toBe('b');
  });
  it('Centralized Command forbids captures before a previous king move', () => {
    const g = position({ e1: 'wk', e2: 'bp', a1: 'wr', a8: 'br', h8: 'bk' }, 'command');
    expect(has(g, 'e1', 'e2')).toBe(false);
    expect(has(g, 'a1', 'a8')).toBe(false);
    expect(has(g, 'e1', 'd1')).toBe(true);
  });
  it('Centralized Command enforces the exact three-personal-turn window', () => {
    const g = position({ e1: 'wk', a1: 'wr', a8: 'br', h8: 'bk' }, 'command');
    g.lastKingTurn.w = 2;
    for (const completed of [2, 3, 4]) { g.turns.w = completed; expect(has(g, 'a1', 'a8')).toBe(true); }
    g.turns.w = 5;
    expect(has(g, 'a1', 'a8')).toBe(false);
  });
  it('counts castling as a king move for Centralized Command', () => {
    const g = position({ e1: 'wk', h1: 'wr', e8: 'bk' }, 'command');
    g.rights.w.king = true;
    const next = move(g, 'e1', 'g1');
    expect(next.lastKingTurn.w).toBe(1);
  });
  it.each(['w', 'b'] as const)('Even Keeled uses personal move parity for %s', color => {
    const g = position({ e1: 'wk', h8: 'bk', a1: `${color}r`, a8: `${color === 'w' ? 'b' : 'w'}r` }, 'even', color);
    expect(has(g, 'a1', 'a8')).toBe(false);
    g.turns[color] = 1;
    expect(has(g, 'a1', 'a8')).toBe(true);
    g.turns[color] = 2;
    expect(has(g, 'a1', 'a8')).toBe(false);
  });
  it('Alternator permits either first move, then forces the opposite category', () => {
    const g = newGame('alternator', 'horse');
    expect(has(g, 'a2', 'a3')).toBe(true);
    expect(has(g, 'b1', 'c3')).toBe(true);
    let next = move(g, 'a2', 'a3');
    next = move(next, 'a7', 'a6');
    expect(has(next, 'b2', 'b3')).toBe(false);
    expect(has(next, 'b1', 'c3')).toBe(true);
    next = move(next, 'b1', 'c3');
    next = move(next, 'b7', 'b6');
    expect(has(next, 'c3', 'b1')).toBe(false);
    expect(has(next, 'b2', 'b3')).toBe(true);
  });
  it('Alternator classifies promotion as a pawn move', () => {
    const g = position({ a7: 'wp', e1: 'wk', h8: 'bk' }, 'alternator');
    expect(move(g, 'a7', 'a8', 'q').lastPawn.w).toBe(true);
  });
  it('Horse Tranquilizer allows quiet knight moves but no knight captures, including kings', () => {
    const g = position({ e1: 'wk', b1: 'wn', c3: 'bk' }, 'horse');
    expect(has(g, 'b1', 'a3')).toBe(true);
    expect(has(g, 'b1', 'c3')).toBe(false);
  });
  it('Cess prohibits h-file destinations, but allows leaving the h-file', () => {
    const g = position({ e1: 'wk', h1: 'wr', e8: 'bk', f3: 'wn' }, 'cess');
    expect(has(g, 'f3', 'h4')).toBe(false);
    expect(has(g, 'h1', 'h8')).toBe(false);
    expect(has(g, 'h1', 'g1')).toBe(true);
    g.rights.w.king = true;
    expect(has(g, 'e1', 'g1')).toBe(true);
  });
  it('loses with no legal moves instead of stalemate, including drawback-only blockage', () => {
    const g = position({ e1: 'wk', e8: 'bk' }, 'alternator', 'b');
    g.drawbacks.w = 'alternator';
    g.lastPawn.w = false;
    const next = move(g, 'e8', 'd8');
    expect(pseudoMoves(next).length).toBeGreaterThan(0);
    expect(next.result).toEqual({ winner: 'b', reason: 'White has no legal moves' });
  });
});

describe('en passant and castling', () => {
  it('captures a double-stepped pawn en passant and removes the correct piece', () => {
    const g = position({ e1: 'wk', e8: 'bk', e5: 'wp', d7: 'bp' }, null, 'b');
    const next = move(move(g, 'd7', 'd5'), 'e5', 'd6');
    expect(next.board[index('d5')]).toBeNull();
    expect(next.board[index('d6')]?.color).toBe('w');
  });
  it('expires pawn en passant after a reply and applies capture drawbacks', () => {
    const g = position({ e1: 'wk', e8: 'bk', e5: 'wp', d7: 'bp' }, null, 'b');
    g.drawbacks.w = 'even';
    const next = move(g, 'd7', 'd5');
    expect(has(next, 'e5', 'd6')).toBe(false);
    next.turns.w = 1;
    expect(has(next, 'e5', 'd6')).toBe(true);
    let expired = move(next, 'e1', 'f1');
    expired = move(expired, 'e8', 'f8');
    expect(has(expired, 'e5', 'd6')).toBe(false);
  });
  it.each([
    ['w', 'e1', 'g1', 'h1', 'f1', 'a8'],
    ['w', 'e1', 'c1', 'a1', 'd1', 'h8'],
    ['b', 'e8', 'g8', 'h8', 'f8', 'a1'],
    ['b', 'e8', 'c8', 'a8', 'd8', 'h1'],
  ] as const)('castles %s %s-%s with rook and rights updates', (color, home, dest, rook, transit, enemy) => {
    const g = position({ [home]: `${color}k`, [rook]: `${color}r`, [enemy]: `${color === 'w' ? 'b' : 'w'}k` }, null, color);
    g.rights[color] = { king: true, queen: true };
    const next = move(g, home, dest);
    expect(next.board[index(rook)]).toBeNull();
    expect(next.board[index(transit)]?.kind).toBe('r');
    expect(next.board[index(dest)]?.kind).toBe('k');
    expect(next.rights[color]).toEqual({ king: false, queen: false });
    expect(next.kingPass?.squares).toEqual([index(home), index(transit)]);
  });
  it('allows castling out of and through attacks, then king capture on home square', () => {
    const g = position({ e1: 'wk', h1: 'wr', e8: 'br', a8: 'bk' });
    g.rights.w.king = true;
    const next = move(g, 'e1', 'g1');
    expect(has(next, 'e8', 'e1')).toBe(true);
    const end = move(next, 'e8', 'e1');
    expect(end.board[index('g1')]).toBeNull();
    expect(end.result?.reason).toBe('King captured');
  });
  it('captures the king on the rook landing square, not merely the rook', () => {
    const g = position({ e1: 'wk', h1: 'wr', f8: 'br', a8: 'bk' });
    g.rights.w.king = true;
    const next = move(move(g, 'e1', 'g1'), 'f8', 'f1');
    expect(next.board[index('g1')]).toBeNull();
    expect(next.board[index('f1')]?.color).toBe('b');
    expect(next.result?.reason).toBe('King captured');
  });
  it('allows any otherwise legal move to the home square, including a pawn forward move', () => {
    const g = position({ e1: 'wk', h1: 'wr', e2: 'bp', a8: 'bk' });
    g.rights.w.king = true;
    const next = move(move(g, 'e1', 'g1'), 'e2', 'e1', 'q');
    expect(next.result?.winner).toBe('b');
    expect(next.board[index('g1')]).toBeNull();
  });
  it('applies the capturing player drawback to king en passant and expires after one reply', () => {
    const g = position({ e1: 'wk', h1: 'wr', e8: 'br', a8: 'bk' });
    g.drawbacks.b = 'even';
    g.rights.w.king = true;
    const next = move(g, 'e1', 'g1');
    expect(has(next, 'e8', 'e1')).toBe(false);
    next.turns.b = 1;
    expect(has(next, 'e8', 'e1')).toBe(true);
    let expired = move(next, 'a8', 'a7');
    expired = move(expired, 'g1', 'h2');
    expect(expired.kingPass).toBeNull();
    expect(legalMoves(expired).find(m => uci(m) === 'e8e1')?.capture).toBeUndefined();
  });
  it('cannot castle through pieces, without the rook, or after a rook/king moves and returns', () => {
    const start = newGame('horse', 'horse');
    expect(has(start, 'e1', 'g1')).toBe(false);
    const g = position({ e1: 'wk', h1: 'wr', a8: 'bk' });
    g.rights.w.king = true;
    let next = move(g, 'h1', 'h2');
    next = move(next, 'a8', 'a7');
    next = move(next, 'h2', 'h1');
    next = move(next, 'a7', 'a8');
    expect(has(next, 'e1', 'g1')).toBe(false);
    g.board[index('h1')] = null;
    expect(has(g, 'e1', 'g1')).toBe(false);
  });
});
