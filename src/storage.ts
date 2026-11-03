import { DRAWBACKS, type Color, type Game } from './game';

export type Mode = 'ai' | 'local';
export type Saved = { version: 1; game: Game; mode: Mode; human: Color; flipped: boolean; strength: number };
export const SAVE_KEY = 'drawback-chess-v1';
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const color = (value: unknown): value is Color => value === 'w' || value === 'b';
const cell = (value: unknown) => Number.isInteger(value) && Number(value) >= 0 && Number(value) < 64;
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const pair = (value: unknown, test: (item: unknown) => boolean) => record(value) && test(value.w) && test(value.b);
const piece = (value: unknown) => value === null ||
  (record(value) && color(value.color) && ['p', 'n', 'b', 'r', 'q', 'k'].includes(String(value.kind)));
function validMove(value: unknown): boolean {
  return record(value) && cell(value.from) && cell(value.to) &&
    (value.capture === undefined || cell(value.capture)) &&
    (value.promotion === undefined || ['q', 'r', 'b', 'n'].includes(String(value.promotion))) &&
    (value.castle === undefined || (record(value.castle) && cell(value.castle.rookFrom) && cell(value.castle.rookTo)));
}
export function isSaved(value: unknown): value is Saved {
  if (!record(value) || value.version !== 1 || !['ai', 'local'].includes(String(value.mode)) ||
      !color(value.human) || typeof value.flipped !== 'boolean' || typeof value.strength !== 'number' || ![200, 400, 900].includes(value.strength)) return false;
  const g = value.game;
  if (!record(g) || !Array.isArray(g.board) || g.board.length !== 64 || !g.board.every(piece) ||
      !color(g.turn) || !pair(g.rights, v => record(v) && typeof v.king === 'boolean' && typeof v.queen === 'boolean') ||
      !pair(g.drawbacks, v => DRAWBACKS.some(d => d.id === v)) ||
      !pair(g.revealed, v => typeof v === 'boolean') || !pair(g.turns, count) ||
      !pair(g.lastPawn, v => v === null || typeof v === 'boolean') ||
      !pair(g.lastKingTurn, v => v === null || count(v)) || !(g.ep === null || cell(g.ep)) ||
      !(g.kingPass === null || (record(g.kingPass) && color(g.kingPass.color) && cell(g.kingPass.king) &&
        Array.isArray(g.kingPass.squares) && g.kingPass.squares.length === 2 && g.kingPass.squares.every(cell))) ||
      !(g.result === null || (record(g.result) && color(g.result.winner) && typeof g.result.reason === 'string')) ||
      !Array.isArray(g.history) || !g.history.every(h => record(h) && color(h.color) && typeof h.label === 'string' && validMove(h.move))) return false;
  return true;
}
export function loadSaved(): { saved: Saved | null; error: string | null } {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { saved: null, error: null };
    const saved: unknown = JSON.parse(raw);
    if (!isSaved(saved)) throw new Error('Saved game has an unsupported format.');
    return { saved, error: null };
  } catch (error) {
    console.error('Could not restore game:', error);
    return { saved: null, error: 'Your saved game could not be restored. A fresh game has been started.' };
  }
}
