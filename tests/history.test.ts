import { expect, it } from 'vitest';
import { fen, index, newGame, play, positionAt, type Game } from '../src/game';

it('reconstructs every position and rule state including castling without altering the live game', () => {
  const positions: Game[] = [newGame('fog', 'command')];
  for (const [from, to] of [
    ['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'], ['b8', 'c6'],
    ['f1', 'c4'], ['g8', 'f6'], ['e1', 'g1'], ['f8', 'c5'],
  ]) positions.push(play(positions.at(-1)!, { from: index(from), to: index(to) }));
  const live = positions.at(-1)!;
  const before = JSON.stringify(live);
  for (let ply = 0; ply < positions.length; ply++) {
    const restored = positionAt(live, ply);
    expect(fen(restored)).toBe(fen(positions[ply]));
    expect(restored.board).toEqual(positions[ply].board);
    expect(restored.rights).toEqual(positions[ply].rights);
    expect(restored.kingPass).toEqual(positions[ply].kingPass);
    expect(restored.ep).toEqual(positions[ply].ep);
    expect(restored.lastKingTurn).toEqual(positions[ply].lastKingTurn);
    expect(restored.history).toHaveLength(ply);
  }
  expect(JSON.stringify(live)).toBe(before);
});

it('restores a captured pawn and en passant eligibility when browsing back', () => {
  let g = newGame('horse', 'horse');
  for (const [from, to] of [
    ['e2', 'e4'], ['a7', 'a6'], ['e4', 'e5'], ['d7', 'd5'], ['e5', 'd6'],
  ]) g = play(g, { from: index(from), to: index(to) });
  const beforeCapture = positionAt(g, 4);
  expect(beforeCapture.board[index('d5')]).toEqual({ color: 'b', kind: 'p' });
  expect(beforeCapture.board[index('e5')]).toEqual({ color: 'w', kind: 'p' });
  expect(beforeCapture.ep).toBe(index('d6'));
  expect(g.board[index('d5')]).toBeNull();
});

it('rejects invalid history indices', () => {
  for (const ply of [-1, 1, 0.5, NaN]) expect(() => positionAt(newGame(), ply)).toThrow('Invalid history position');
});

it('reconstructs promotions and the pieces they captured', () => {
  let g = newGame('horse', 'horse');
  for (const [from, to, promotion] of [
    ['a2', 'a4'], ['h7', 'h5'], ['a4', 'a5'], ['h5', 'h4'],
    ['a5', 'a6'], ['h4', 'h3'], ['a6', 'b7'], ['h3', 'g2'],
    ['b7', 'a8', 'q'], ['g2', 'h1', 'n'],
  ] as const) g = play(g, { from: index(from), to: index(to), promotion });
  expect(positionAt(g, 9).board[index('a8')]).toEqual({ color: 'w', kind: 'q' });
  expect(positionAt(g, 8).board[index('a8')]).toEqual({ color: 'b', kind: 'r' });
  expect(positionAt(g, 9).board[index('h1')]).toEqual({ color: 'w', kind: 'r' });
  expect(g.board[index('h1')]).toEqual({ color: 'b', kind: 'n' });
});
