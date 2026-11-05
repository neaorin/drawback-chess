import { DRAWBACKS, type Color, type Game } from './game';

export type Mode = 'ai' | 'local';
export type Saved = { version: 1; game: Game; mode: Mode; human: Color; flipped: boolean; strength: number };
export const SAVE_KEY = 'drawback-chess-v1';
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const color = (value: unknown): value is Color => value === 'w' || value === 'b';
const cell = (value: unknown) => Number.isInteger(value) && Number(value) >= 0 && Number(value) < 64;
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0;
const pair = (value: unknown, test: (item: unknown) => boolean) => record(value) && test(value.w) && test(value.b);
const kind = (value: unknown) => ['p', 'n', 'b', 'r', 'q', 'k'].includes(String(value));
const piece = (value: unknown) => value === null ||
  (record(value) && color(value.color) && ['p', 'n', 'b', 'r', 'q', 'k'].includes(String(value.kind)));
function validMove(value: unknown): boolean {
  return record(value) && cell(value.from) && cell(value.to) &&
    (value.capture === undefined || cell(value.capture)) &&
    (value.promotion === undefined || ['q', 'r', 'b', 'n'].includes(String(value.promotion))) &&
    (value.castle === undefined || (record(value.castle) && cell(value.castle.rookFrom) && cell(value.castle.rookTo)));
}
function validRules(value: unknown): boolean {
  const list = (v: unknown, test: (item: unknown) => boolean) => Array.isArray(v) && v.every(test);
  const optionalBool = (v: unknown) => v === undefined || typeof v === 'boolean';
  return record(value) && count(value.seed) && Number(value.seed) <= 0xffffffff &&
    pair(value.params, p => record(p) && cell(p.square) && count(p.move) && Number(p.move) >= 1 &&
      (p.color === 0 || p.color === 1) && (p.parity === 0 || p.parity === 1) &&
      Number.isInteger(p.rank) && Number(p.rank) >= 1 && Number(p.rank) <= 8 && ['n', 'b', 'r'].includes(String(p.piece))) &&
    record(value.pieces) && Object.entries(value.pieces).every(([at, memory]) => cell(Number(at)) &&
      record(memory) && count(memory.id) && optionalBool(memory.fatigued) && optionalBool(memory.penitent) &&
      optionalBool(memory.frozen) && (memory.queenMode === undefined || ['r', 'b'].includes(String(memory.queenMode)))) &&
    pair(value.players, p => record(p) && count(p.checks) && kind(p.shape) &&
      list(p.kissed, kind) && list(p.studied, kind) && list(p.studying, kind) && list(p.central, cell) &&
      list(p.achieved, v => v === 'fischer-random')) &&
    list(value.events, e => record(e) && validMove(e) && color(e.color) && kind(e.kind) && count(e.pieceId) &&
      (e.captured === undefined || kind(e.captured)) && optionalBool(e.gaveCheck)) &&
    record(value.engineBans) && Object.entries(value.engineBans).every(([ply, move]) =>
      count(Number(ply)) && typeof move === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move));
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
  if (g.rules !== undefined) return validRules(g.rules);
  return record(g.drawbacks) && [g.drawbacks.w, g.drawbacks.b].every(id =>
    ['castle', 'command', 'even', 'alternator', 'horse', 'cess', 'fog'].includes(String(id)));
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
