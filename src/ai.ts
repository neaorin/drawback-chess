import { Chess, validateFen, type Square } from 'chess.js';
import { fen, finishRepetition, fogVisibility, legalMoves, other, square, transition, uci, type Game, type Move, type Color } from './game';
import { needsEngineBan, rulesFor } from './drawback-state';

export interface EnginePort {
  postMessage(message: string): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<string>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

export class StockfishClient {
  private port: EnginePort;
  private pending: { accept: (line: string) => boolean; resolve: (line: string) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  private ready: Promise<void>;
  private disposed = false;
  constructor(port: EnginePort = new Worker(`${import.meta.env.BASE_URL}engine/stockfish.js`)) {
    this.port = port;
    port.onmessage = event => {
      for (const line of String(event.data).split('\n')) {
        const request = this.pending;
        if (request?.accept(line)) {
          clearTimeout(request.timer);
          this.pending = null;
          request.resolve(line);
        }
      }
    };
    port.onerror = event => this.fail(new Error(event.message || 'Stockfish worker failed to load.'));
    this.ready = this.initialize();
    // Keep an early worker failure handled until the first move awaits initialization.
    void this.ready.catch(() => undefined);
  }
  private fail(error: Error) {
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(error);
      this.pending = null;
    }
  }
  private wait(command: string, accept: (line: string) => boolean, timeout = 15000): Promise<string> {
    if (this.disposed) return Promise.reject(new Error('Engine has been stopped.'));
    if (this.pending) return Promise.reject(new Error('Engine request already in progress.'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        reject(new Error('Stockfish timed out. Variant engine is available instead.'));
      }, timeout);
      this.pending = { accept, resolve, reject, timer };
      this.port.postMessage(command);
    });
  }
  private async initialize() {
    await this.wait('uci', line => line.trim() === 'uciok');
    this.port.postMessage('setoption name Hash value 16');
    await this.wait('isready', line => line.trim() === 'readyok');
  }
  async choose(g: Game, roots: Move[], milliseconds: number): Promise<Move> {
    await this.ready;
    this.port.postMessage(`position fen ${fen(g)}`);
    const line = await this.wait(`go movetime ${milliseconds} searchmoves ${roots.map(uci).join(' ')}`,
      text => text.startsWith('bestmove '), milliseconds + 10000);
    const token = line.split(/\s+/)[1];
    const move = roots.find(m => uci(m) === token);
    if (!move) throw new Error(`Stockfish returned an unapproved move: ${token}`);
    return move;
  }
  dispose() {
    this.disposed = true;
    this.fail(new Error('Engine stopped.'));
    this.port.terminate();
  }
}

export function stockfishRoots(g: Game): Move[] {
  if (g.drawbacks[g.turn] === 'fog') return [];
  if (g.drawbacks[g.turn] === 'drag' || g.drawbacks[g.turn] === 'shapeshifter') return [];
  const position = fen(g);
  if (!validateFen(position).ok) return [];
  const chess = new Chess(position);
  const enemyKing = g.board.findIndex(p => p?.kind === 'k' && p.color === other(g.turn));
  // Stockfish cannot safely search a position where the non-moving king is attacked.
  if (enemyKing < 0 || chess.isAttacked(square(enemyKing) as Square, g.turn)) return [];
  const orthodox = new Set(chess.moves({ verbose: true }).map(m => m.from + m.to + (m.promotion ?? '')));
  return legalMoves(g).filter(m => orthodox.has(uci(m)));
}

const values = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
function evaluate(g: Game, perspective: Color): number {
  if (g.result) return g.result.winner === null ? 0 : g.result.winner === perspective ? 100000 : -100000;
  return g.board.reduce((sum, p, i) => {
    if (!p) return sum;
    const advance = p.color === 'w' ? 7 - Math.floor(i / 8) : Math.floor(i / 8);
    const center = 7 - Math.abs(3.5 - i % 8) - Math.abs(3.5 - Math.floor(i / 8));
    const score = values[p.kind] + (p.kind === 'p' ? advance * 9 : center * 4);
    return sum + (p.color === perspective ? score : -score);
  }, 0);
}
function ordered(g: Game): Move[] {
  return legalMoves(g).sort((a, b) =>
    (b.capture === undefined ? 0 : values[g.board[b.capture]!.kind]) -
    (a.capture === undefined ? 0 : values[g.board[a.capture]!.kind]));
}
function fogMove(g: Game): Move {
  const { visible } = fogVisibility(g, g.turn);
  let best: Move | undefined, bestScore = -Infinity;
  for (const move of legalMoves(g)) {
    const piece = g.board[move.from]!;
    const captured = move.capture !== undefined && visible.has(move.capture) ? g.board[move.capture] : null;
    const row = Math.floor(move.to / 8), col = move.to % 8;
    const advance = g.turn === 'w' ? 7 - row : row;
    // Score only observed captures and our own destination; never search the hidden board.
    const score = (captured ? values[captured.kind] : 0) +
      (move.promotion ? values[move.promotion] : 0) +
      (piece.kind === 'p' ? advance * 9 : 0) +
      (7 - Math.abs(3.5 - col) - Math.abs(3.5 - row)) * 4;
    if (score > bestScore) { bestScore = score; best = move; }
  }
  if (!best) throw new Error('No legal move is available for the fog AI.');
  return best;
}

export function variantMove(g: Game, depth = 2): Move {
  if (g.drawbacks[g.turn] === 'fog') return fogMove(g);
  const perspective = g.turn;
  // The AI knows only its own drawback, even though both are stored on this device.
  const visible: Game = { ...g, drawbacks: { ...g.drawbacks, [other(perspective)]: null } };
  function search(state: Game, remaining: number, alpha: number, beta: number): number {
    if (!remaining || state.result) return evaluate(state, perspective);
    if (needsEngineBan(state)) state = { ...state, drawbacks: { ...state.drawbacks, [state.turn]: null } };
    const moves = ordered(state);
    if (!moves.length) return state.turn === perspective ? -100000 : 100000;
    const maximize = state.turn === perspective;
    let best = maximize ? -Infinity : Infinity;
    for (const m of moves) {
      const score = search(transition(state, m, false), remaining - 1, alpha, beta);
      best = maximize ? Math.max(best, score) : Math.min(best, score);
      if (maximize) alpha = Math.max(alpha, best);
      else beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
  let best: Move | undefined, score = -Infinity;
  for (const m of ordered(g)) {
    const candidate = search(transition(visible, m, false), depth - 1, -Infinity, Infinity);
    if (candidate > score) { score = candidate; best = m; }
  }
  if (!best) throw new Error('No legal move is available for the AI.');
  return best;
}

export async function chooseAI(g: Game, client: StockfishClient, milliseconds = 400):
  Promise<{ move: Move; source: string; warning?: string }> {
  if (g.drawbacks[g.turn] === 'fog') return { move: fogMove(g), source: 'Variant engine · fog-limited view' };
  const moves = legalMoves(g);
  const win = moves.find(m => m.capture !== undefined && g.board[m.capture]?.kind === 'k');
  if (win) return { move: win, source: 'Variant engine · king capture' };
  const roots = stockfishRoots(g);
  if (!roots.length) return { move: variantMove(g), source: 'Variant engine · non-standard position' };
  try {
    return { move: await client.choose(g, roots, milliseconds), source: 'Stockfish 19 · constrained search' };
  } catch (error) {
    const warning = error instanceof Error ? error.message : String(error);
    console.error('Stockfish unavailable:', error);
    return { move: variantMove(g), source: 'Variant engine · Stockfish unavailable', warning };
  }

}

export async function resolveEngineBan(g: Game, client: StockfishClient, milliseconds = 400):
  Promise<{ game: Game; source: string; warning?: string }> {
  if (!needsEngineBan(g)) return { game: g, source: 'Move restriction ready' };
  const unrestricted = { ...g, drawbacks: { ...g.drawbacks, [g.turn]: null } };
  if (legalMoves(unrestricted).length === 0) {
    return {
      game: { ...g, result: { winner: other(g.turn), reason: 'Ichthyophobe: no legal moves remain' } },
      source: 'Variant engine · no legal moves',
    };
  }
  const result = await chooseAI(unrestricted, client, milliseconds);
  const state = rulesFor(g);
  const next = {
    ...g, rules: { ...state, engineBans: { ...state.engineBans, [g.turns.w + g.turns.b]: uci(result.move) } },
  };
  if (legalMoves(next).length === 0) next.result = { winner: other(g.turn), reason: 'Ichthyophobe: no legal moves remain' };
  return {
    game: finishRepetition(next), source: `Ichthyophobe · ${result.source}`,
    warning: result.warning ?? (result.source.startsWith('Stockfish') ? undefined :
      'Ichthyophobe uses the variant engine in positions Stockfish cannot analyze safely.'),
  };
}
