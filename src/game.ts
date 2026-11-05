import { DRAWBACKS, DIFFICULTY_LEVELS, difficultyLevel, type DrawbackChoice, type DrawbackId } from './drawback-catalogue';
import { movementKind, initialRules, needsEngineBan, parameterDescription, randomMoveInfo, ruleContext, rulesFor, updateRules } from './drawback-state';
import { positionalMoves } from './drawback-positional';
import { temporalMoves } from './drawback-temporal';
import { drawbackLoss } from './drawback-losses';
import type { RuleState } from './drawback-types';

export { DRAWBACKS, type DrawbackId };
export type Color = 'w' | 'b';
export type Kind = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type Piece = { color: Color; kind: Kind };
export interface Move {
  from: number;
  to: number;
  promotion?: Exclude<Kind, 'p' | 'k'>;
  capture?: number;
  castle?: { rookFrom: number; rookTo: number };
}
export interface Game {
  board: (Piece | null)[];
  turn: Color;
  rights: Record<Color, { king: boolean; queen: boolean }>;
  ep: number | null;
  kingPass: { color: Color; king: number; squares: number[] } | null;
  drawbacks: Record<Color, DrawbackId | null>;
  revealed: Record<Color, boolean>;
  turns: Record<Color, number>;
  lastKingTurn: Record<Color, number | null>;
  lastPawn: Record<Color, boolean | null>;
  history: { color: Color; move: Move; label: string }[];
  result: { winner: Color; reason: string } | null;
  rules?: RuleState;
}
export const other = (c: Color): Color => c === 'w' ? 'b' : 'w';
export const colorName = (c: Color) => c === 'w' ? 'White' : 'Black';
export const square = (i: number) => 'abcdefgh'[i % 8] + (8 - Math.floor(i / 8));
export function index(s: string): number {
  if (!/^[a-h][1-8]$/.test(s)) throw new Error(`Invalid square: ${s}`);
  return (8 - Number(s[1])) * 8 + 'abcdefgh'.indexOf(s[0]);
}
export const uci = (m: Move) => square(m.from) + square(m.to) + (m.promotion ?? '');
export function randomDrawback(choice: DrawbackChoice = 'random'): DrawbackId {
  const level = DIFFICULTY_LEVELS.find(level => level.choice === choice);
  const pool = level ? DRAWBACKS.filter(d => difficultyLevel(d.difficulty) === level) : DRAWBACKS;
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return pool[value[0] % pool.length].id;
}
export function newGame(white = randomDrawback(), black = randomDrawback(), seed?: number): Game {
  const board: Game['board'] = Array.from({ length: 64 }, () => null);
  const back: Kind[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  for (let x = 0; x < 8; x++) {
    board[x] = { color: 'b', kind: back[x] };
    board[x + 8] = { color: 'b', kind: 'p' };
    board[x + 48] = { color: 'w', kind: 'p' };
    board[x + 56] = { color: 'w', kind: back[x] };
  }
  const game: Game = {
    board, turn: 'w', rights: { w: { king: true, queen: true }, b: { king: true, queen: true } },
    ep: null, kingPass: null, drawbacks: { w: white, b: black }, revealed: { w: false, b: false },
    turns: { w: 0, b: 0 }, lastKingTurn: { w: null, b: null }, lastPawn: { w: null, b: null },
    history: [], result: null,
  };
  game.rules = initialRules(game, seed ?? crypto.getRandomValues(new Uint32Array(1))[0]);
  if (!needsEngineBan(game) && legalMoves(game).length === 0) {
    game.result = { winner: 'b', reason: 'White has no legal moves' };
  }
  return game;
}

const diagonals = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const straight = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const knights = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const onBoard = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

// Generate geometry only: check, pins and attacked castling paths never restrict movement.
export function pseudoMoves(g: Game, color = g.turn): Move[] {
  const moves: Move[] = [];
  for (let from = 0; from < 64; from++) {
    const piece = g.board[from];
    if (!piece || piece.color !== color) continue;
    const kind = movementKind(g, from);
    if (!kind) continue;
    const r = Math.floor(from / 8), c = from % 8;
    const add = (to: number, capture?: number, castle?: Move['castle']) => {
      if (piece.kind === 'p' && (to < 8 || to >= 56)) {
        for (const promotion of ['q', 'r', 'b', 'n'] as const) moves.push({ from, to, capture, promotion });
      } else moves.push({ from, to, capture, castle });
    };
    const targetCapture = (to: number) => {
      if (g.kingPass?.color === other(color) && g.kingPass.squares.includes(to)) return g.kingPass.king;
      if (g.board[to]?.color === other(color)) return to;
      return undefined;
    };
    if (piece.kind === 'p') {
      const direction = color === 'w' ? -1 : 1;
      const row = r + direction;
      if (!onBoard(row, c)) continue;
      const next = row * 8 + c;
      if (!g.board[next]) {
        add(next, targetCapture(next));
        if (r === (color === 'w' ? 6 : 1) && !g.board[next + direction * 8]) {
          add(next + direction * 8, targetCapture(next + direction * 8));
        }
      }
      for (const dc of [-1, 1]) {
        if (!onBoard(row, c + dc)) continue;
        const to = row * 8 + c + dc;
        if (g.board[to]?.color === color) continue;
        const cap = targetCapture(to);
        if (cap !== undefined) add(to, cap);
        else if (g.ep === to && !g.board[to]) {
          const victim = to - direction * 8;
          if (g.board[victim]?.kind === 'p' && g.board[victim]?.color === other(color)) add(to, victim);
        }
      }
      continue;
    }
    const directions = kind === 'n' ? knights : kind === 'b' ? diagonals :
      kind === 'r' ? straight : [...diagonals, ...straight];
    for (const [dr, dc] of directions) {
      for (let n = 1; n <= (kind === 'n' || kind === 'k' ? 1 : 7); n++) {
        const row = r + dr * n, col = c + dc * n;
        if (!onBoard(row, col)) break;
        const to = row * 8 + col;
        if (g.board[to]?.color === color) break;
        add(to, targetCapture(to));
        if (g.board[to]) break;
      }
    }
    const home = color === 'w' ? 60 : 4;
    if (piece.kind === 'k' && from === home) {
      for (const side of ['king', 'queen'] as const) {
        const step = side === 'king' ? 1 : -1;
        const rookFrom = home + (side === 'king' ? 3 : -4);
        const rook = g.board[rookFrom];
        const between = side === 'king' ? [1, 2] : [-1, -2, -3];
        if (g.rights[color][side] && rook?.kind === 'r' && rook.color === color &&
            between.every(d => !g.board[home + d])) {
          add(home + step * 2, undefined, { rookFrom, rookTo: home + step });
        }
      }
    }
  }
  return moves;
}

export function attackedKings(g: Game): Set<number> {
  const attacked = new Set<number>();
  // Use geometry rather than hidden drawbacks so the warning never reveals a secret.
  for (const color of ['w', 'b'] as const) {
    for (const move of pseudoMoves(g, color)) {
      if (move.capture !== undefined && g.board[move.capture]?.kind === 'k') attacked.add(move.capture);
    }
  }
  return attacked;
}

export function fogVisibility(g: Game, color: Color): { visible: Set<number>; occupied: Set<number> } {
  const visible = new Set<number>();
  const occupied = new Set<number>();
  if (g.drawbacks[color] !== 'fog' || g.result) {
    for (let i = 0; i < 64; i++) visible.add(i);
    return { visible, occupied };
  }
  for (const move of pseudoMoves(g, color)) visible.add(move.to);
  for (let i = 0; i < 64; i++) {
    const piece = g.board[i];
    if (piece?.color !== color) continue;
    visible.add(i);
    if (piece.kind !== 'p') continue;
    const direction = color === 'w' ? -8 : 8;
    const steps = Math.floor(i / 8) === (color === 'w' ? 6 : 1) ? 2 : 1;
    for (let step = 1; step <= steps; step++) {
      const to = i + step * direction;
      if (to < 0 || to >= 64) break;
      const blocker = g.board[to];
      if (!blocker) continue;
      if (blocker.color !== color) occupied.add(to);
      break;
    }
  }
  // Another piece's view takes precedence over a pawn's unknown blocker.
  for (const i of visible) occupied.delete(i);
  return { visible, occupied };
}

export function visibleKingAttacks(g: Game, color: Color): Set<number> {
  if (g.drawbacks[color] !== 'fog' || g.result) return attackedKings(g);
  const { visible } = fogVisibility(g, color);
  const attacked = new Set<number>();
  for (const attacker of ['w', 'b'] as const) {
    for (const move of pseudoMoves(g, attacker)) {
      if (visible.has(move.from) && move.capture !== undefined &&
          visible.has(move.capture) && g.board[move.capture]?.kind === 'k') attacked.add(move.capture);
    }
  }
  return attacked;
}

function commandCaptureMoves(g: Game, color: Color): number {
  const last = g.lastKingTurn[color];
  return last === null ? 0 : Math.max(0, 3 - (g.turns[color] - last));
}

export function drawbackMoveInfo(g: Game, color = g.turn): string | null {
  if (g.result || color !== g.turn) return null;
  switch (g.drawbacks[color]) {
    case 'command': {
      const remaining = commandCaptureMoves(g, color);
      return remaining > 0
        ? `Can capture for the next ${remaining} ${remaining === 1 ? 'move' : 'moves'} (including this move).`
        : 'Cannot capture. Move your king to enable captures on your next three moves.';
    }
    case 'even':
      return (g.turns[color] + 1) % 2 === 0
        ? 'Can capture this move. Cannot capture next move.'
        : 'Cannot capture this move. Can capture next move.';
    case 'alternator':
      return g.lastPawn[color] === null ? 'May move a pawn or a non-pawn.' :
        g.lastPawn[color] ? 'Must move a non-pawn.' : 'Must move a pawn.';
    case 'fog':
      return 'Fog hides unseen squares. ? marks an unknown enemy blocking a pawn. Opponent moves stay hidden until game over.';
    case 'bipartisanship':
      return randomMoveInfo(g);
    case 'always-check-it-might-be-mate':
      return null;
    case 'glorious-battle': {
      const start = rulesFor(g).params[color].move;
      const turn = g.turns[color] + 1;
      return turn >= start && turn < start + 4
        ? `Battle! Must capture for the next ${start + 4 - turn} moves` : null;
    }
    case 'expedition': {
      const params = rulesFor(g).params[color];
      return g.turns[color] + 1 === params.move ? `Must move to ${square(params.square)}.` : null;
    }
    case 'boxing-with-shadows': {
      const lastEnemy = rulesFor(g).events.filter(event => event.color !== color).at(-1);
      return lastEnemy && legalMoves(g).some(move => move.to === lastEnemy.from)
        ? `Must move to ${square(lastEnemy.from)}.` : null;
    }
    case 'barbarian-rage': {
      const last = rulesFor(g).events.filter(event => event.color === color).at(-1);
      return last?.capture !== undefined && legalMoves(g).some(move => move.capture !== undefined)
        ? 'Must capture.' : null;
    }
    default:
      if (['horse', 'castle', 'cess'].includes(g.drawbacks[color] ?? '')) return null;
      return randomMoveInfo(g) ?? drawbackDescription(g, color);
  }
}

export function drawbackDescription(g: Game, color: Color): string {
  const drawback = DRAWBACKS.find(d => d.id === g.drawbacks[color]);
  return drawback ? parameterDescription(g, color, drawback.description) : 'No drawback.';
}

export function legalMoves(g: Game): Move[] {
  if (g.result) return [];
  if (needsEngineBan(g)) return [];
  const d = g.drawbacks[g.turn], turn = g.turns[g.turn] + 1;
  const base = pseudoMoves(g).filter(m => {
    const p = g.board[m.from]!;
    if (d === 'cess' && (m.to % 8 === 7 || (m.castle && m.castle.rookTo % 8 === 7))) return false;
    if (d === 'alternator' && g.lastPawn[g.turn] !== null && g.lastPawn[g.turn] === (p.kind === 'p')) return false;
    if (m.capture !== undefined) {
      if (d === 'horse' && p.kind === 'n') return false;
      if (d === 'even' && turn % 2 !== 0) return false;
      if (d === 'command' && commandCaptureMoves(g, g.turn) === 0) return false;
    }
    return true;
  });
  let context = ruleContext(g, base);
  let moves = positionalMoves(context);
  context = { ...context, moves };
  moves = temporalMoves(context);
  if (d === 'now-kiss') {
    moves = moves.filter(m => m.capture === undefined ||
      !['b', 'n', 'r'].includes(g.board[m.from]!.kind) ||
      context.state.players[g.turn].kissed.includes(g.board[m.from]!.kind));
  }
  if (d === 'ichthyophobe') {
    const banned = context.state.engineBans[g.turns.w + g.turns.b];
    moves = moves.filter(m => uci(m) !== banned);
  }
  return moves;
}

function revokeRook(g: Game, at: number) {
  if (at === 0) g.rights.b.queen = false;
  if (at === 7) g.rights.b.king = false;
  if (at === 56) g.rights.w.queen = false;
  if (at === 63) g.rights.w.king = false;
}

// Internal transition for search; the public entry point validates every move.
export function transition(g: Game, m: Move, finish = true): Game {
  const color = g.turn, opponent = other(color), piece = g.board[m.from]!;
  const captured = m.capture === undefined ? null : g.board[m.capture];
  const next: Game = {
    ...g, board: [...g.board], turn: opponent,
    rights: { w: { ...g.rights.w }, b: { ...g.rights.b } },
    revealed: { ...g.revealed }, turns: { ...g.turns, [color]: g.turns[color] + 1 },
    lastKingTurn: { ...g.lastKingTurn }, lastPawn: { ...g.lastPawn, [color]: piece.kind === 'p' },
    ep: piece.kind === 'p' && Math.abs(m.to - m.from) === 16 ? (m.to + m.from) / 2 : null,
    kingPass: null, history: g.history, result: null,
  };
  next.board[m.from] = null;
  if (m.capture !== undefined) {
    next.board[m.capture] = null;
    revokeRook(next, m.capture);
  }
  next.board[m.to] = { ...piece, kind: m.promotion ?? piece.kind };
  if (piece.kind === 'k') {
    next.rights[color] = { king: false, queen: false };
    next.lastKingTurn[color] = next.turns[color];
  }
  if (piece.kind === 'r') revokeRook(next, m.from);
  if (m.castle) {
    next.board[m.castle.rookTo] = next.board[m.castle.rookFrom];
    next.board[m.castle.rookFrom] = null;
    next.kingPass = { color, king: m.to, squares: [m.from, m.castle.rookTo] };
  }
  next.rules = updateRules(g, next, m);
  if (captured?.kind === 'k') next.result = { winner: color, reason: 'King captured' };
  else if (captured?.kind === 'r' && g.drawbacks[opponent] === 'castle') {
    next.result = { winner: color, reason: 'Castle Doctrine: a rook was captured' };
  }
  if (!next.result) {
    // A reply may trigger either player's loss; the mover's violation takes precedence.
    for (const candidate of [color, opponent]) {
      const reason = drawbackLoss(next, candidate);
      if (reason) {
        const name = DRAWBACKS.find(d => d.id === g.drawbacks[candidate])?.name;
        next.result = { winner: other(candidate), reason: `${name ?? colorName(candidate)}: ${reason.split(': ').slice(1).join(': ')}` };
        break;
      }
    }
  }
  if (finish && !next.result && !needsEngineBan(next) && legalMoves(next).length === 0) {
    next.result = { winner: color, reason: `${colorName(opponent)} has no legal moves` };
  }
  return next;
}
export function play(g: Game, requested: Pick<Move, 'from' | 'to' | 'promotion'>): Game {
  const move = legalMoves(g).find(m => m.from === requested.from && m.to === requested.to && m.promotion === requested.promotion);
  if (!move) throw new Error('That move is not legal under your drawback.');
  const piece = g.board[move.from]!;
  const label = move.castle ? (move.to > move.from ? 'O-O' : 'O-O-O') :
    `${piece.kind === 'p' ? '' : piece.kind.toUpperCase()}${square(move.from)}${move.capture !== undefined ? 'x' : '-'}${square(move.to)}${move.promotion ? '=' + move.promotion.toUpperCase() : ''}${move.capture !== undefined && move.capture !== move.to ? ' e.p.' : ''}`;
  const next = transition(g, move);
  next.history = [...g.history, { color: g.turn, move, label }];
  return next;
}

export function positionAt(g: Game, ply: number): Game {
  if (!Number.isInteger(ply) || ply < 0 || ply > g.history.length) throw new Error('Invalid history position.');
  if (ply === g.history.length) return g;
  const white = g.drawbacks.w, black = g.drawbacks.b;
  if (!white || !black) throw new Error('Cannot reconstruct a game without its original drawbacks.');
  let position = newGame(white, black, rulesFor(g).seed);
  position.rules = { ...position.rules!, engineBans: { ...rulesFor(g).engineBans } };
  for (const entry of g.history.slice(0, ply)) position = play(position, entry.move);
  return position;
}

export function fen(g: Game): string {
  const rows = [];
  for (let r = 0; r < 8; r++) {
    let row = '', empty = 0;
    for (let c = 0; c < 8; c++) {
      const p = g.board[r * 8 + c];
      if (!p) empty++;
      else {
        if (empty) row += empty;
        empty = 0;
        row += p.color === 'w' ? p.kind.toUpperCase() : p.kind;
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  const rights = (g.rights.w.king ? 'K' : '') + (g.rights.w.queen ? 'Q' : '') +
    (g.rights.b.king ? 'k' : '') + (g.rights.b.queen ? 'q' : '');
  return `${rows.join('/')} ${g.turn} ${rights || '-'} ${g.ep === null ? '-' : square(g.ep)} 0 ${Math.floor(g.history.length / 2) + 1}`;
}
