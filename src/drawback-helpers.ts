import { pseudoMoves, type Color, type Game, type Kind, type Move } from './game';

export const row = (at: number) => Math.floor(at / 8);
export const file = (at: number) => at % 8;
export const shade = (at: number) => (row(at) + file(at)) % 2;
export const adjacent = (a: number, b: number) =>
  a !== b && Math.max(Math.abs(row(a) - row(b)), Math.abs(file(a) - file(b))) === 1;
export const distance = (a: number, b: number) => Math.abs(row(a) - row(b)) + Math.abs(file(a) - file(b));
export const rim = (at: number) => row(at) === 0 || row(at) === 7 || file(at) === 0 || file(at) === 7;
export const advance = (at: number, color: Color) => color === 'w' ? 7 - row(at) : row(at);
export const rightward = (a: number, b: number, color: Color) => (file(b) - file(a)) * (color === 'w' ? 1 : -1);
export const value: Record<Kind, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
export const squares = (g: Game, color: Color, kind?: Kind) =>
  g.board.flatMap((p, at) => p?.color === color && (!kind || p.kind === kind) ? [at] : []);
export const king = (g: Game, color: Color) => squares(g, color, 'k')[0];
export function attacked(g: Game, at: number, by: Color): boolean {
  return pseudoMoves(g, by).some(m => m.capture === at);
}
export function defended(g: Game, at: number, by: Color): boolean {
  const board = [...g.board];
  board[at] = { color: by === 'w' ? 'b' : 'w', kind: 'p' };
  return pseudoMoves({ ...g, board, kingPass: null }, by).some(m => m.capture === at);
}
export function preview(g: Game, m: Move): Game {
  const board = [...g.board], piece = board[m.from]!;
  board[m.from] = null;
  if (m.capture !== undefined) board[m.capture] = null;
  board[m.to] = { ...piece, kind: m.promotion ?? piece.kind };
  if (m.castle) {
    board[m.castle.rookTo] = board[m.castle.rookFrom];
    board[m.castle.rookFrom] = null;
  }
  return { ...g, board, kingPass: null, ep: null };
}

export function preferredCapture(g: Game, m: Move): boolean {
  if (m.capture === undefined) return false;
  if (g.drawbacks[g.turn] === 'escort-mission') return g.board[m.from]!.kind === 'k';
  if (g.drawbacks[g.turn] === 'evil-twin') return g.board[m.from]!.kind === g.board[m.capture]!.kind;
  if (g.drawbacks[g.turn] === 'ooh-shiny') return !attacked(preview(g, m), m.to, g.turn === 'w' ? 'b' : 'w');
  if (g.drawbacks[g.turn] === 'simplifier') return value[g.board[m.from]!.kind] <= value[g.board[m.capture]!.kind];
  return false;
}

export function unluckySquares(seed: number, color: Color, turn: number): Set<number> {
  return new Set(Array.from({ length: 64 }, (_, at) => at)
    .sort((a, b) => randomNumber(seed, color, turn, 100 + a) - randomNumber(seed, color, turn, 100 + b) || a - b)
    .slice(0, 32));
}

export function randomNumber(seed: number, color: Color, turn: number, salt: number): number {
  let x = (seed ^ Math.imul(turn + 1, 0x9e3779b9) ^ Math.imul(salt + 1, 0x85ebca6b) ^ (color === 'w' ? 1 : 2)) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}
