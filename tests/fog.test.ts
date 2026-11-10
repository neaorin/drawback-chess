import { describe, expect, it } from 'vitest';
import { attackedKings, fogVisibility, index, legalMoves, newGame, play, uci, visibleKingAttacks, type Color, type Game, type Kind } from '../src/game';
import { isSaved } from '../src/storage';

function position(pieces: Record<string, `${Color}${Kind}`>, color: Color = 'w'): Game {
  const g = newGame('fog', 'fog');
  g.board.fill(null);
  g.rights = { w: { king: false, queen: false }, b: { king: false, queen: false } };
  g.turn = color;
  for (const [at, piece] of Object.entries(pieces)) {
    g.board[index(at)] = { color: piece[0] as Color, kind: piece[1] as Kind };
  }
  return g;
}
describe('fog visibility', () => {
  it('shows all own pieces and all move destinations, not the enemy starting ranks', () => {
    const g = newGame('fog', 'fog');
    for (const color of ['w', 'b'] as const) {
      const { visible, occupied } = fogVisibility(g, color);
      expect(visible.size).toBe(32);
      expect(occupied.size).toBe(0);
      expect(visible.has(index(color === 'w' ? 'e8' : 'e1'))).toBe(false);
      g.turn = color;
      for (const m of legalMoves(g)) {
        expect(visible.has(m.from)).toBe(true);
        expect(visible.has(m.to)).toBe(true);
      }
    }
  });
  it('reveals sliding lines up to a capture, but not beyond or behind friendly blockers', () => {
    const g = position({ a1: 'wk', d4: 'wr', d6: 'bq', d2: 'wp', h8: 'bk' });
    const { visible } = fogVisibility(g, 'w');
    expect(visible.has(index('d5'))).toBe(true);
    expect(visible.has(index('d6'))).toBe(true);
    expect(visible.has(index('d7'))).toBe(false);
    expect(visible.has(index('d1'))).toBe(false);
    expect(visible.has(index('h4'))).toBe(true);
  });
  it('shows a knight destination without revealing intervening squares', () => {
    const g = position({ a1: 'wk', d4: 'wn', h8: 'bk' });
    const { visible } = fogVisibility(g, 'w');
    expect(visible.has(index('f5'))).toBe(true);
    expect(visible.has(index('e4'))).toBe(false);
  });
  it.each([
    ['w', 'e2', 'e3', 'e4', 'bq'],
    ['b', 'e7', 'e6', 'e5', 'wq'],
  ] as const)('shows a one-step blocker as occupied only for %s', (color, pawn, blocker, behind, enemy) => {
    const g = position({ a1: 'wk', h8: 'bk', [pawn]: `${color}p`, [blocker]: enemy }, color);
    const { visible, occupied } = fogVisibility(g, color);
    expect(occupied.has(index(blocker))).toBe(true);
    expect(visible.has(index(blocker))).toBe(false);
    expect(visible.has(index(behind))).toBe(false);
    expect(occupied.has(index(behind))).toBe(false);
    expect(legalMoves(g).some(m => m.from === index(pawn) && m.to === index(blocker))).toBe(false);
  });
  it('shows the second-step blocker without allowing a pawn double step', () => {
    const g = position({ a1: 'wk', h8: 'bk', e2: 'wp', e4: 'br' });
    const { visible, occupied } = fogVisibility(g, 'w');
    expect(visible.has(index('e3'))).toBe(true);
    expect(visible.has(index('e4'))).toBe(false);
    expect(occupied.has(index('e4'))).toBe(true);
    expect(legalMoves(g).map(uci)).toContain('e2e3');
    expect(legalMoves(g).map(uci)).not.toContain('e2e4');
  });
  it('does not disclose a blocker beyond the first blocked pawn square', () => {
    const g = position({ a1: 'wk', h8: 'bk', e2: 'wp', e3: 'wp', e4: 'bq' });
    const view = fogVisibility(g, 'w');
    // The pawn on e3 sees its own next square, but the e2 pawn cannot see e5.
    expect(view.occupied.has(index('e4'))).toBe(true);
    expect(view.visible.has(index('e5'))).toBe(false);
    g.board[index('e3')] = { color: 'b', kind: 'n' };
    expect(fogVisibility(g, 'w').occupied).toEqual(new Set([index('e3')]));
  });
  it('reveals a forward blocker fully when another piece can capture it', () => {
    const g = position({ a1: 'wk', h8: 'bk', e2: 'wp', e3: 'bq', c2: 'wn' });
    const { visible, occupied } = fogVisibility(g, 'w');
    expect(visible.has(index('e3'))).toBe(true);
    expect(occupied.has(index('e3'))).toBe(false);
  });
  it('reveals pawn diagonal captures, but not empty diagonals', () => {
    const g = position({ a1: 'wk', h8: 'bk', e4: 'wp', d5: 'br' });
    const { visible } = fogVisibility(g, 'w');
    expect(visible.has(index('d5'))).toBe(true);
    expect(visible.has(index('f5'))).toBe(false);
    expect(visible.has(index('e5'))).toBe(true);
  });
  it('updates visibility after moves and does not change move legality', () => {
    let g = newGame('fog', 'horse');
    const originalMoves = legalMoves(g).map(uci);
    const ordinary = { ...g, drawbacks: { ...g.drawbacks, w: 'horse' as const } };
    expect(originalMoves).toEqual(legalMoves(ordinary).map(uci));
    expect(fogVisibility(g, 'w').visible.has(index('e5'))).toBe(false);
    g = play(g, { from: index('e2'), to: index('e4') });
    expect(fogVisibility(g, 'w').visible.has(index('e5'))).toBe(true);
    expect(fogVisibility(g, 'w').visible.has(index('e3'))).toBe(false);
  });
  it('includes pawn en passant and castling destinations', () => {
    const g = position({ e1: 'wk', h1: 'wr', h8: 'bk', e5: 'wp', d5: 'bp' });
    g.rights.w.king = true;
    g.ep = index('d6');
    const { visible } = fogVisibility(g, 'w');
    expect(visible.has(index('d6'))).toBe(true);
    expect(visible.has(index('g1'))).toBe(true);
  });
  it('shows the full board without fog and after game over, not after voluntary reveal', () => {
    const g = newGame('fog', 'horse');
    expect(fogVisibility(g, 'b').visible.size).toBe(64);
    g.revealed.w = true;
    expect(fogVisibility(g, 'w').visible.size).toBe(32);
    g.result = { winner: 'b', reason: 'King captured' };
    expect(fogVisibility(g, 'w').visible.size).toBe(64);
    expect(fogVisibility(g, 'w').occupied.size).toBe(0);
  });
  it('does not expose hidden attackers through the king halo', () => {
    const g = position({ e1: 'wk', a8: 'bk', e8: 'br' });
    expect(attackedKings(g).has(index('e1'))).toBe(true);
    expect(visibleKingAttacks(g, 'w').has(index('e1'))).toBe(false);
    g.board[index('c7')] = { color: 'w', kind: 'n' };
    expect(visibleKingAttacks(g, 'w').has(index('e1'))).toBe(true);
  });
  it('can persist and restore the new drawback', () => {
    const value = { version: 1, game: newGame('fog', 'fog'), mode: 'ai', human: 'w', flipped: false, strength: 400 };
    expect(isSaved(JSON.parse(JSON.stringify(value)))).toBe(true);
  });
});
