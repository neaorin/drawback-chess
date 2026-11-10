import { DRAWBACKS, restoreRepetitions, type Color, type Game } from './game';
import { DIFFICULTY_LEVELS, type DrawbackChoice } from './drawback-catalogue';

export type Mode = 'ai' | 'local';
export type Saved = { version: 1; game: Game; mode: Mode; human: Color; flipped: boolean; strength: number };
export const SAVE_KEY = 'drawback-chess-v1';
export const NEW_GAME_KEY = 'drawback-chess-new-game-v1';
export type NewGameChoices = {
  mode: Mode; human: Color; strength: number; drawback: DrawbackChoice; opponentDrawback: DrawbackChoice;
};
export function isNewGameChoices(value: unknown): value is NewGameChoices {
  const choice = (v: unknown) => v === 'random' || DRAWBACKS.some(d => d.id === v) ||
    DIFFICULTY_LEVELS.some(level => level.choice === v);
  return record(value) && (value.mode === 'ai' || value.mode === 'local') && color(value.human) &&
    [200, 400, 900].includes(Number(value.strength)) && typeof value.strength === 'number' &&
    choice(value.drawback) && choice(value.opponentDrawback);
}
export function loadNewGameChoices(): { choices: NewGameChoices | null; error: string | null } {
  try {
    const raw = localStorage.getItem(NEW_GAME_KEY);
    if (!raw) return { choices: null, error: null };
    const choices: unknown = JSON.parse(raw);
    if (!isNewGameChoices(choices)) throw new Error('New Game choices have an unsupported format.');
    return { choices, error: null };
  } catch (error) {
    console.error('Could not restore New Game choices:', error);
    return { choices: null, error: 'Your previous New Game choices could not be restored. Default choices will be used.' };
  }
}
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
      !(g.result === null || (record(g.result) && (g.result.winner === null || color(g.result.winner)) && typeof g.result.reason === 'string')) ||
      !Array.isArray(g.history) || !g.history.every(h => record(h) && color(h.color) && typeof h.label === 'string' && validMove(h.move))) return false;
  if (g.repetitions !== undefined && (!record(g.repetitions) || Array.isArray(g.repetitions) ||
      !Object.entries(g.repetitions).every(([key, value]) => key.length > 0 && count(value) && Number(value) > 0))) return false;
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
    return { saved: { ...saved, game: restoreRepetitions(saved.game) }, error: null };
  } catch (error) {
    console.error('Could not restore game:', error);
    return { saved: null, error: 'Your saved game could not be restored. A fresh game has been started.' };
  }
}
