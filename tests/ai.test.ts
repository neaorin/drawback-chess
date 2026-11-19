import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chooseAI, fogPositionDanger, fogSquareDanger, resolveEngineBan, selectFogMove, stockfishRoots, StockfishClient, variantMove, type EnginePort } from '../src/ai';
import { DRAWBACKS, fogVisibility, index, legalMoves, newGame, other, play, positionKey, repetitionCount, transition, uci, type Game } from '../src/game';
import { initialRules, needsEngineBan } from '../src/drawback-state';
import { attacked, preview } from '../src/drawback-helpers';

function fakeEngine(best = 'e2e4') {
  const sent: string[] = [];
  const port: EnginePort = {
    onmessage: null, onerror: null, terminate: vi.fn(),
    postMessage(text) {
      sent.push(text);
      const reply = text === 'uci' ? 'uciok' : text === 'isready' ? 'readyok' : text.startsWith('go ') ? `bestmove ${best}` : null;
      if (reply) queueMicrotask(() => port.onmessage?.({ data: reply } as MessageEvent<string>));
    },
  };
  return { port, sent };
}
function bare(): Game {
  const g = newGame('horse', 'horse');
  g.board.fill(null);
  g.board[index('e1')] = { color: 'w', kind: 'k' };
  g.board[index('e8')] = { color: 'b', kind: 'k' };
  g.rights = { w: { king: false, queen: false }, b: { king: false, queen: false } };
  return g;
}

describe('AI constraints', () => {
  beforeEach(() => { vi.spyOn(Math, 'random').mockReturnValue(0); });
  afterEach(() => { vi.restoreAllMocks(); });

  it.each(['w', 'b'] as const)('captures the fog queen attacking its king instead of only rewarding king movement for %s', color => {
    const g = bare();
    g.board.fill(null);
    g.turn = color;
    g.drawbacks = { w: 'fog', b: 'fog' };
    const at = (name: string) => color === 'w' ? index(name) : 63 - index(name);
    g.board[at('e1')] = { color, kind: 'k' };
    g.board[at('d2')] = { color, kind: 'b' };
    g.board[at('a1')] = { color, kind: 'r' };
    g.board[at('c1')] = { color: other(color), kind: 'q' };
    g.board[at('c8')] = { color: other(color), kind: 'r' };
    g.board[at('h8')] = { color: other(color), kind: 'k' };
    const before = JSON.stringify(g);
    expect(variantMove(g)).toMatchObject({ to: at('c1'), capture: at('c1') });
    expect(JSON.stringify(g)).toBe(before);
  });
  it.each(['w', 'b'] as const)('credits fog blocks and penalizes exposing another friendly piece for %s', color => {
    const g = bare();
    g.board.fill(null);
    g.turn = color;
    const at = (name: string) => color === 'w' ? index(name) : 63 - index(name);
    g.board[at('e1')] = { color, kind: 'k' };
    g.board[at('b5')] = { color, kind: 'b' };
    g.board[at('e8')] = { color: other(color), kind: 'r' };
    const blocked = preview(g, { from: at('b5'), to: at('e2') });
    const unknown = new Set<number>();
    expect(fogPositionDanger(g, unknown, 4000) - fogPositionDanger(blocked, unknown, 4000)).toBeGreaterThan(18000);
    const exposed = preview(blocked, { from: at('e2'), to: at('d3') });
    expect(fogPositionDanger(exposed, unknown, 4000)).toBeGreaterThan(fogPositionDanger(blocked, unknown, 4000) + 18000);
    const saferKing = preview(g, { from: at('e1'), to: at('d1') });
    const riskierKing = preview(g, { from: at('e1'), to: at('d2') });
    expect(fogPositionDanger(saferKing, unknown, 4000)).toBeLessThan(fogPositionDanger(riskierKing, unknown, 4000));
  });

  it('gives the best fog move 80% and weights only alternatives within 90% by score', () => {
    const candidates = [90, 100, 95, 89.99].map((score, from) => ({ score, move: { from, to: from + 8 } }));
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 10000; i++) {
      vi.mocked(Math.random).mockReturnValue((i + 0.5) / 10000);
      counts[selectFogMove(candidates).from]++;
    }
    expect(counts[1]).toBe(8000);
    expect(Math.abs(counts[0] - 2000 * 90 / 185)).toBeLessThan(1);
    expect(Math.abs(counts[2] - 2000 * 95 / 185)).toBeLessThan(1);
    expect(counts[3]).toBe(0);
    expect(candidates.map(candidate => candidate.score)).toEqual([90, 100, 95, 89.99]);
  });

  it('handles sole candidates, score ties and negative fog scores', () => {
    const candidates = [0, 1, 2].map(from => ({ score: 0, move: { from, to: from + 8 } }));
    vi.mocked(Math.random).mockReturnValue(0.79);
    expect(selectFogMove(candidates)).toBe(candidates[0].move);
    vi.mocked(Math.random).mockReturnValue(0.85);
    expect(selectFogMove(candidates)).toBe(candidates[1].move);
    vi.mocked(Math.random).mockReturnValue(0.99);
    expect(selectFogMove(candidates)).toBe(candidates[2].move);
    expect(selectFogMove(candidates.slice(0, 1))).toBe(candidates[0].move);
    const negative = [-100, -110, -111].map((score, from) => ({ score, move: { from, to: from + 8 } }));
    expect(selectFogMove(negative)).toBe(negative[1].move);
    negative[1].score = -110.01;
    expect(selectFogMove(negative)).toBe(negative[0].move);
    expect(() => selectFogMove([])).toThrow('No legal move');
  });

  it('can choose a different legal fog opening from the near-best pool', () => {
    const g = newGame('fog', 'fog', 42);
    const best = variantMove(g);
    vi.mocked(Math.random).mockReturnValue(0.99);
    const alternative = variantMove(g);
    expect(uci(alternative)).not.toBe(uci(best));
    expect(legalMoves(g).map(uci)).toContain(uci(alternative));
  });
  it.each(['w', 'b'] as const)('includes both minor-piece and pawn development in the fog opening pool for %s', color => {
    const g = newGame('fog', 'fog', 42);
    g.turn = color;
    const kinds = new Set<string>();
    for (let i = 0; i < 100; i++) {
      vi.mocked(Math.random).mockReturnValue((i + 0.5) / 100);
      kinds.add(g.board[variantMove(g).from]!.kind);
    }
    expect(kinds.has('n')).toBe(true);
    expect(kinds.has('p')).toBe(true);
  });
  it.each(['w', 'b'] as const)('develops fog minor pieces within the first four personal moves for %s', color => {
    let g = newGame('fog', 'fog', 42);
    const developed = new Set<number>();
    for (let ply = 0; ply < 8 && !g.result; ply++) {
      const move = variantMove(g);
      if (g.turn === color && ['n', 'b'].includes(g.board[move.from]!.kind)) {
        developed.add(g.rules!.pieces[move.from].id);
      }
      g = play(g, move);
    }
    expect(developed.size).toBeGreaterThanOrEqual(2);
  });
  it.each(['w', 'b'] as const)('scales fog square danger by depth, phase, material and unknown blockers for %s', color => {
    const g = bare();
    g.board.fill(null);
    g.turn = color;
    g.drawbacks[color] = 'fog';
    const at = (name: string) => color === 'w' ? index(name) : 63 - index(name);
    const danger = (square: string, material = 4000, unknown = new Set<number>()) => {
      const board = [...g.board];
      board[at(square)] = { color, kind: 'q' };
      return fogSquareDanger({ ...g, board }, unknown, at(square), material);
    };
    expect(danger('d2')).toBeLessThan(danger('d4'));
    expect(danger('d4')).toBeLessThan(danger('d7'));
    expect(danger('d4', 1000)).toBeLessThan(danger('d4'));
    const unknown = new Set([at('c5')]);
    expect(danger('d4', 4000, unknown)).toBeGreaterThan(danger('d4'));
    g.board[at('c5')] = { color: other(color), kind: 'p' };
    expect(danger('d4', 0)).toBe(1);
    g.board[at('c5')] = null;
    g.board[at('d8')] = { color: other(color), kind: 'r' };
    expect(danger('d4')).toBe(1);
    expect(danger('d4', 4000, new Set([at('d6')]))).toBeLessThan(1);
    g.board[at('d8')] = null;
    for (const completed of [29, 40]) {
      g.turns[color] = completed;
      expect(danger('d2')).toBeCloseTo(0.25);
      expect(danger('d7')).toBeCloseTo(0.25);
    }
  });
  it.each(['w', 'b'] as const)('avoids a quiet fog queen move near an unknown pawn blocker regardless of its identity for %s', color => {
    const g = bare();
    g.board.fill(null);
    g.turn = color;
    g.drawbacks = { w: 'fog', b: 'fog' };
    const at = (name: string) => color === 'w' ? index(name) : 63 - index(name);
    g.board[at('h1')] = { color, kind: 'k' };
    g.board[at('h8')] = { color: other(color), kind: 'k' };
    g.board[at('d1')] = { color, kind: 'q' };
    g.board[at('c4')] = { color, kind: 'p' };
    g.board[at('f3')] = { color, kind: 'n' };
    let expected: string | undefined;
    for (const kind of ['p', 'n', 'b', 'r', 'q'] as const) {
      g.board[at('c5')] = { color: other(color), kind };
      expect(fogVisibility(g, color).occupied.has(at('c5'))).toBe(true);
      const move = variantMove(g);
      expect(move).not.toMatchObject({ from: at('d1'), to: at('d4') });
      expected ??= uci(move);
      expect(uci(move)).toBe(expected);
    }
  });
  it('does not send immediately losing orthodox moves when only variant moves meet the deadline', () => {
    const g = bare();
    g.drawbacks.w = 'inching-forward';
    g.turns.w = 5;
    g.board[index('a2')] = { color: 'b', kind: 'r' };
    expect(legalMoves(g).some(m => !transition(g, m).result)).toBe(true);
    expect(stockfishRoots(g)).toEqual([]);
  });

  it('does not filter Stockfish choices using the opponents hidden loss conditions', () => {
    const g = bare();
    const expected = stockfishRoots(g).map(uci);
    for (const drawback of ['inching-forward', 'boastful', 'ivory-tower', 'modest'] as const) {
      g.drawbacks.b = drawback;
      g.turns.b = 6;
      expect(stockfishRoots(g).map(uci)).toEqual(expected);
    }
  });

  it('keeps legal Stockfish choices when every move loses to the deadline', () => {
    const g = newGame('inching-forward', 'horse', 42);
    g.turns.w = 5;
    expect(stockfishRoots(g).length).toBeGreaterThan(0);
    expect(stockfishRoots(g).every(m => transition(g, m).result?.winner === 'b')).toBe(true);
  });

  it.each(['w', 'b'] as const)('excludes immediate Inching Forward losses from Stockfish choices for %s', async color => {
    for (const completed of [5, 11, 17]) {
      const g = bare();
      g.turn = color;
      g.drawbacks[color] = 'inching-forward';
      g.turns[color] = completed;
      const home = color === 'w' ? 'e1' : 'e8';
      const rank = color === 'w' ? completed === 5 ? 1 : completed === 11 ? 2 : 3 :
        completed === 5 ? 8 : completed === 11 ? 7 : 6;
      g.board[index(home)] = null;
      g.board[index(`e${rank}`)] = { color, kind: 'k' };
      g.board[index(color === 'w' ? 'a1' : 'a8')] = { color, kind: 'r' };
      const before = JSON.stringify(g);
      const roots = stockfishRoots(g);
      expect(roots.length).toBeGreaterThan(0);
      expect(roots.every(m => g.board[m.from]?.kind === 'k')).toBe(true);
      expect(roots.every(m => transition(g, m).result?.winner !== other(color))).toBe(true);
      expect(legalMoves(g).some(m => transition(g, m).result?.winner === other(color))).toBe(true);
      const { port, sent } = fakeEngine(uci(roots[0]));
      const client = new StockfishClient(port);
      try {
        const choice = await chooseAI(g, client, 20);
        expect(play(g, choice.move).result).toBeNull();
        expect(sent).toContain(`go movetime 20 searchmoves ${roots.map(uci).join(' ')}`);
        expect(play(g, variantMove(g)).result?.winner).not.toBe(other(color));
      } finally { client.dispose(); }
      expect(JSON.stringify(g)).toBe(before);
    }
  });

  it('finishes a pending repetition draw after resolving the engine restriction', async () => {
    const g = play(newGame('horse', 'ichthyophobe', 42), { from: index('g1'), to: index('f3') });
    g.repetitions = { [positionKey(g)]: 3 };
    const { port } = fakeEngine('g8f6');
    const client = new StockfishClient(port);
    try {
      const resolved = await resolveEngineBan(g, client, 20);
      expect(resolved.game.result).toEqual({ winner: null, reason: 'Threefold repetition' });
      expect(repetitionCount(resolved.game)).toBe(3);
      expect(resolved.game.history).toHaveLength(1);
      expect(g.result).toBeNull();
    } finally {
      client.dispose();
    }
  });
  it.each(DRAWBACKS)('returns only permitted standard roots for $name', d => {
    const g = newGame(d.id, 'horse', 42);
    const allowed = new Set(legalMoves(g).map(uci));
    if (['fog', 'drag', 'shapeshifter', 'ichthyophobe'].includes(d.id)) expect(stockfishRoots(g)).toEqual([]);
    else expect(stockfishRoots(g).length).toBeGreaterThan(0);
    expect(stockfishRoots(g).every(m => allowed.has(uci(m)))).toBe(true);
  });
  it('never sends unsafe positions with an attacked non-moving king to Stockfish', () => {
    const g = bare();
    g.board[index('e7')] = { color: 'w', kind: 'r' };
    expect(stockfishRoots(g)).toEqual([]);
  });
  it('handles adjacent kings and takes a legal king capture immediately', async () => {
    const g = bare();
    g.board[index('e8')] = null;
    g.board[index('e2')] = { color: 'b', kind: 'k' };
    expect(stockfishRoots(g)).toEqual([]);
    const { port, sent } = fakeEngine();
    const client = new StockfishClient(port);
    const result = await chooseAI(g, client);
    expect(uci(result.move)).toBe('e1e2');
    expect(sent.some(c => c.startsWith('position'))).toBe(false);
    client.dispose();
  });
  it('sends UCI searchmoves excluding a drawback-forbidden capture', async () => {
    const g = bare();
    g.drawbacks.w = 'even';
    g.board[index('a1')] = { color: 'w', kind: 'r' };
    g.board[index('a8')] = { color: 'b', kind: 'r' };
    const roots = stockfishRoots(g);
    expect(roots.map(uci)).not.toContain('a1a8');
    const { port, sent } = fakeEngine(uci(roots[0]));
    const client = new StockfishClient(port);
    await client.choose(g, roots, 100);
    expect(sent).toContain(`go movetime 100 searchmoves ${roots.map(uci).join(' ')}`);
    expect(sent.find(s => s.startsWith('position fen'))).toBeDefined();
    client.dispose();
  });
  it('rejects an engine move outside the whitelist', async () => {
    const g = newGame('cess', 'horse');
    const { port } = fakeEngine('h2h4');
    const client = new StockfishClient(port);
    await expect(client.choose(g, stockfishRoots(g), 20)).rejects.toThrow('unapproved move');
    client.dispose();
  });
  it('reports engine failure and explicitly uses the variant engine', async () => {
    const { port } = fakeEngine('a1a8');
    const client = new StockfishClient(port);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = await chooseAI(newGame('horse', 'horse'), client, 10);
    expect(result.warning).toContain('unapproved move');
    expect(result.source).toContain('unavailable');
    expect(legalMoves(newGame('horse', 'horse')).map(uci)).toContain(uci(result.move));
    expect(logged).toHaveBeenCalled();
    client.dispose();
    logged.mockRestore();
  });
  it('does not use the opponents secret in variant search', () => {
    const g = newGame('horse', 'horse');
    const before = JSON.stringify(g);
    const expected = uci(variantMove(g));
    for (const d of DRAWBACKS) expect(uci(variantMove({ ...g, drawbacks: { ...g.drawbacks, b: d.id } }))).toBe(expected);
    expect(JSON.stringify(g)).toBe(before);
  }, 30000);
  it('variant search obeys its own drawback', () => {
    for (const d of DRAWBACKS) {
      const g = newGame(d.id, 'horse', 42);
      if (needsEngineBan(g)) g.rules!.engineBans[0] = 'e2e4';
      expect(legalMoves(g).map(uci)).toContain(uci(variantMove(g)));
    }
  }, 30000);
  it.each(['w', 'b'] as const)('avoids expensive fog captures of pawns for %s despite unseen defenders', color => {
    for (const kind of ['q', 'r'] as const) {
      const g = bare();
      g.turn = color;
      g.drawbacks[color] = 'fog';
      const at = (name: string) => color === 'w' ? index(name) : 63 - index(name);
      g.board[at('d4')] = { color, kind };
      g.board[at('d5')] = { color: other(color), kind: 'p' };
      const capture = legalMoves(g).find(m => m.from === at('d4') && m.to === at('d5'))!;
      expect(capture.capture).toBe(at('d5'));
      expect(uci(variantMove(g))).not.toBe(uci(capture));
      g.board[at('d6')] = { color: other(color), kind: 'r' };
      expect(uci(variantMove(g))).not.toBe(uci(capture));
    }
  });
  it.each(['w', 'b'] as const)('still prefers a pawn-for-rook fog capture for %s', color => {
    const g = bare();
    g.board.fill(null);
    g.turn = color;
    g.drawbacks[color] = 'fog';
    const at = (name: string) => color === 'w' ? index(name) : 63 - index(name);
    g.board[at('h1')] = { color, kind: 'k' };
    g.board[at('h8')] = { color: other(color), kind: 'k' };
    g.board[at('d4')] = { color, kind: 'p' };
    g.board[at('e5')] = { color: other(color), kind: 'r' };
    expect(variantMove(g)).toMatchObject({ from: at('d4'), to: at('e5'), capture: at('e5') });
  });
  it.each(['w', 'b'] as const)('prefers a supported fog pawn advance over an unsupported double push for %s', color => {
    const g = bare();
    g.board.fill(null);
    g.turn = color;
    g.drawbacks[color] = 'fog';
    const at = (name: string) => color === 'w' ? index(name) : 63 - index(name);
    g.board[at('h1')] = { color, kind: 'k' };
    g.board[at('h8')] = { color: other(color), kind: 'k' };
    g.board[at('c2')] = { color, kind: 'p' };
    g.board[at('d2')] = { color, kind: 'p' };
    for (const completed of [0, 19]) {
      g.turns[color] = completed;
      expect(variantMove(g)).toMatchObject({ from: at('d2'), to: at('d3') });
    }
  });
  it.each(['w', 'b'] as const)('avoids a fog pawn push into a visible attack even with friendly support for %s', color => {
    const g = bare();
    g.board.fill(null);
    g.turn = color;
    g.drawbacks[color] = 'fog';
    const at = (name: string) => color === 'w' ? index(name) : 63 - index(name);
    g.board[at('h1')] = { color, kind: 'k' };
    g.board[at('h8')] = { color: other(color), kind: 'k' };
    g.board[at('e1')] = { color, kind: 'r' };
    g.board[at('c3')] = { color, kind: 'p' };
    g.board[at('d2')] = { color, kind: 'p' };
    g.board[at('e5')] = { color: other(color), kind: 'p' };
    expect(fogVisibility(g, color).visible.has(at('e5'))).toBe(true);
    expect(variantMove(g)).not.toMatchObject({ from: at('d2'), to: at('d4') });
  });
  it.each(['w', 'b'] as const)('rescues the more valuable visibly attacked fog piece instead of pushing a pawn for %s', color => {
    const g = bare();
    g.board.fill(null);
    g.turn = color;
    g.drawbacks = { w: 'fog', b: 'fog' };
    const at = (name: string) => color === 'w' ? index(name) : 63 - index(name);
    g.board[at('h1')] = { color, kind: 'k' };
    g.board[at('h8')] = { color: other(color), kind: 'k' };
    g.board[at('d3')] = { color, kind: 'q' };
    g.board[at('f3')] = { color, kind: 'r' };
    g.board[at('d4')] = { color, kind: 'p' };
    g.board[at('b3')] = { color, kind: 'p' };
    g.board[at('e4')] = { color: other(color), kind: 'p' };
    expect(fogVisibility(g, color).visible.has(at('e4'))).toBe(true);
    expect(attacked(g, at('d3'), other(color))).toBe(true);
    expect(attacked(g, at('f3'), other(color))).toBe(true);
    const move = variantMove(g);
    expect(move.from).toBe(at('d3'));
    expect(attacked(preview(g, move), move.to, other(color))).toBe(false);
  });
  it.each(['w', 'b'] as const)('does not use unseen attackers to award a fog rescue bonus for %s', color => {
    const g = bare();
    g.board.fill(null);
    g.turn = color;
    g.drawbacks[color] = 'fog';
    const at = (name: string) => color === 'w' ? index(name) : 63 - index(name);
    g.board[at('h1')] = { color, kind: 'k' };
    g.board[at('h8')] = { color: other(color), kind: 'k' };
    g.board[at('d3')] = { color, kind: 'q' };
    g.board[at('d4')] = { color, kind: 'p' };
    const expected = uci(variantMove(g));
    g.board[at('f4')] = { color: other(color), kind: 'n' };
    expect(fogVisibility(g, color).visible.has(at('f4'))).toBe(false);
    expect(attacked(g, at('d3'), other(color))).toBe(true);
    expect(uci(variantMove(g))).toBe(expected);
  });
  it.each(['w', 'b'] as const)('develops an unmoved fog piece without rewarding a return to its starting square for %s', color => {
    const g = bare();
    g.board.fill(null);
    g.turn = color;
    g.drawbacks[color] = 'fog';
    g.turns[color] = 29;
    const at = (name: string) => color === 'w' ? index(name) : 63 - index(name);
    g.board[at('h1')] = { color, kind: 'k' };
    g.board[at('h8')] = { color: other(color), kind: 'k' };
    g.board[at('b1')] = { color, kind: 'n' };
    g.board[at('d4')] = { color, kind: 'n' };
    g.rules = initialRules(g, 42);
    g.rules.events.push({
      color, kind: 'n', pieceId: at('d4'), from: at('f3'), to: at('d4'),
    });
    expect(variantMove(g).from).toBe(at('b1'));
    g.rules.events.push(
      { color, kind: 'n', pieceId: at('b1'), from: at('b1'), to: at('c3') },
      { color, kind: 'n', pieceId: at('b1'), from: at('c3'), to: at('b1') },
    );
    expect(variantMove(g).from).toBe(at('d4'));
  });
  it.each(['w', 'b'] as const)('prefers fog castling but not into a visible attack for %s', color => {
    const g = bare();
    g.board.fill(null);
    g.turn = color;
    g.drawbacks[color] = 'fog';
    const at = (name: string) => color === 'w' ? index(name) : index(name) ^ 56;
    g.board[at('e1')] = { color, kind: 'k' };
    g.board[at('e8')] = { color: other(color), kind: 'k' };
    g.board[at('h1')] = { color, kind: 'r' };
    g.rights[color].king = true;
    g.rules = initialRules(g, 42);
    expect(variantMove(g)).toMatchObject({
      from: at('e1'), to: at('g1'), castle: { rookFrom: at('h1'), rookTo: at('f1') },
    });
    g.board[at('h2')] = { color: other(color), kind: 'b' };
    expect(fogVisibility(g, color).visible.has(at('h2'))).toBe(true);
    expect(legalMoves(g).some(move => move.castle)).toBe(true);
    expect(variantMove(g).castle).toBeUndefined();
  });
  it.each(['w', 'b'] as const)('takes a queen with the fog king unless a visible defender can recapture for %s', color => {
    const g = bare();
    g.board.fill(null);
    g.turn = color;
    g.drawbacks[color] = 'fog';
    const at = (name: string) => color === 'w' ? index(name) : 63 - index(name);
    g.board[at('e1')] = { color, kind: 'k' };
    g.board[at('h8')] = { color: other(color), kind: 'k' };
    g.board[at('a2')] = { color, kind: 'p' };
    g.board[at('e2')] = { color: other(color), kind: 'q' };
    const expected = { from: at('e1'), to: at('e2'), capture: at('e2') };
    expect(variantMove(g)).toMatchObject(expected);
    g.board[at('e3')] = { color: other(color), kind: 'r' };
    expect(fogVisibility(g, color).visible.has(at('e3'))).toBe(false);
    expect(variantMove(g)).toMatchObject(expected);
    g.board[at('a3')] = { color, kind: 'r' };
    g.board[at('d1')] = { color, kind: 'b' };
    expect(fogVisibility(g, color).visible.has(at('e3'))).toBe(true);
    expect(variantMove(g)).not.toMatchObject(expected);
    expect(variantMove(g)).toMatchObject({ from: at('d1'), to: at('e2'), capture: at('e2') });
  });
  it('takes an immediate fog king capture rather than treating it as a defended trade', () => {
    vi.mocked(Math.random).mockReturnValue(0.99);
    const g = bare();
    g.drawbacks.w = 'fog';
    g.board[index('e8')] = null;
    g.board[index('e2')] = { color: 'b', kind: 'k' };
    expect(uci(variantMove(g))).toBe('e1e2');
  });
  it.each(['w', 'b'] as const)('fades fog target-rank risk by personal move 30 for %s', color => {
    const g = bare();
    g.board.fill(null);
    g.turn = color;
    g.drawbacks[color] = 'fog';
    const at = (name: string) => color === 'w' ? index(name) : 63 - index(name);
    g.board[at('a1')] = { color, kind: 'k' };
    g.board[at('h7')] = { color: other(color), kind: 'k' };
    g.board[at('d4')] = { color, kind: 'q' };
    g.board[at('d6')] = { color: other(color), kind: 'b' };
    g.board[at('d1')] = { color: other(color), kind: 'b' };
    for (const completed of [0, 14, 28]) {
      g.turns[color] = completed;
      expect(variantMove(g)).toMatchObject({ from: at('d4'), to: at('d1') });
    }
    for (const completed of [29, 39]) {
      g.turns[color] = completed;
      expect(variantMove(g)).toMatchObject({ from: at('d4'), to: at('d6') });
    }
  });
  it.each(['w', 'b'] as const)('lowers fog recapture risk using known enemy material losses for %s', color => {
    const g = bare();
    g.board.fill(null);
    g.turn = color;
    g.drawbacks[color] = 'fog';
    const at = (name: string) => color === 'w' ? index(name) : 63 - index(name);
    g.board[at('h1')] = { color, kind: 'k' };
    g.board[at('h7')] = { color: other(color), kind: 'k' };
    g.board[at('d4')] = { color, kind: 'q' };
    g.board[at('d3')] = { color: other(color), kind: 'p' };
    const capture = { to: at('d3'), capture: at('d3') };
    expect(variantMove(g)).not.toMatchObject(capture);
    const events = (['q', 'r', 'b', 'b', 'n', 'n'] as const).map(captured => ({
      color: other(color), kind: 'q' as const, pieceId: 1,
      from: at('d4'), to: at('d3'), capture: at('d3'), captured,
    }));
    g.rules!.events = events;
    expect(variantMove(g)).not.toMatchObject(capture);
    g.rules!.events = events.map(event => ({ ...event, color }));
    expect(variantMove(g)).toMatchObject(capture);
  });
  it('uses only the fog view, not Stockfish or identities of unseen pieces', async () => {
    const g = bare();
    g.drawbacks.w = 'fog';
    g.board[index('e2')] = { color: 'w', kind: 'p' };
    g.board[index('e3')] = { color: 'b', kind: 'r' };
    g.board[index('a8')] = { color: 'b', kind: 'q' };
    const before = JSON.stringify(g);
    const expected = uci(variantMove(g));
    const changed: Game = { ...g, board: [...g.board] };
    changed.board[index('e3')] = { color: 'b', kind: 'n' };
    changed.board[index('a8')] = { color: 'b', kind: 'r' };
    expect(uci(variantMove(changed))).toBe(expected);
    const { port, sent } = fakeEngine();
    const client = new StockfishClient(port);
    const result = await chooseAI(g, client);
    expect(result.source).toBe('Variant engine · fog-limited view');
    expect(uci(result.move)).toBe(expected);
    expect(sent.some(s => s.startsWith('position') || s.startsWith('go '))).toBe(false);
    expect(JSON.stringify(g)).toBe(before);
    client.dispose();
  });
  it('handles a position where standard checkmate is not a variant loss', async () => {
    const g = bare();
    g.turn = 'b';
    g.board[index('e1')] = null;
    g.board[index('e8')] = null;
    g.board[index('a8')] = { color: 'b', kind: 'k' };
    g.board[index('c6')] = { color: 'w', kind: 'k' };
    g.board[index('b7')] = { color: 'w', kind: 'q' };
    g.board[index('a7')] = { color: 'w', kind: 'r' };
    expect(legalMoves(g).length).toBeGreaterThan(0);
    expect(stockfishRoots(g)).toHaveLength(0);
    const { port } = fakeEngine();
    const client = new StockfishClient(port);
    const result = await chooseAI(g, client);
    expect(result.source).toContain('Variant engine');
    expect(legalMoves(g).map(uci)).toContain(uci(result.move));
    client.dispose();
  });
  it('plays randomized full games without illegal engine-fallback moves or king loss being ignored', () => {
    for (const d of DRAWBACKS) {
      let g = newGame(d.id, 'command', 42);
      for (let turn = 0; turn < 60 && !g.result; turn++) {
        if (needsEngineBan(g)) g.rules!.engineBans[g.turns.w + g.turns.b] = 'a1a1';
        expect(legalMoves(g).length, `${d.id}, ply ${turn}, ${g.turn} to move`).toBeGreaterThan(0);
        const m = variantMove(g, 1);
        expect(legalMoves(g).map(uci)).toContain(uci(m));
        g = play(g, m);
        if (!g.result) expect(g.board.filter(p => p?.kind === 'k')).toHaveLength(2);
      }
    }
  }, 60000);

  it('prepares and persists the actual Stockfish forbidden move for Ichthyophobe', async () => {
    const g = newGame('ichthyophobe', 'horse', 42);
    const { port, sent } = fakeEngine('e2e4');
    const client = new StockfishClient(port);
    try {
      const prepared = await resolveEngineBan(g, client, 10);
      expect(prepared.game.rules!.engineBans[0]).toBe('e2e4');
      expect(legalMoves(prepared.game).map(uci)).not.toContain('e2e4');
      expect(prepared.source).toContain('Stockfish');
      expect(sent.find(s => s.startsWith('go '))).toContain('e2e4');
      expect(g.rules!.engineBans).toEqual({});
    } finally { client.dispose(); }
  });
});

it('real Stockfish WASM completes a constrained UCI search', async () => {
  const require = createRequire(import.meta.url);
  const stockfish = require('stockfish') as { findEngine: (flavor: string) => string };
  const child = spawn(process.execPath, [stockfish.findEngine('lite-single')], { stdio: ['pipe', 'pipe', 'pipe'] });
  const port: EnginePort = {
    onmessage: null, onerror: null,
    postMessage: message => { child.stdin.write(message + '\n'); },
    terminate: () => { child.kill(); },
  };
  let buffer = '';
  child.stdout.on('data', chunk => {
    buffer += String(chunk);
    const lines = buffer.split('\n');
    buffer = lines.pop()!;
    for (const line of lines) port.onmessage?.({ data: line } as MessageEvent<string>);
  });
  child.on('error', error => port.onerror?.({ message: error.message } as ErrorEvent));
  const client = new StockfishClient(port);
  try {
    const g = newGame('horse', 'castle');
    const roots = legalMoves(g).filter(m => ['e2e4', 'd2d4'].includes(uci(m)));
    const result = await client.choose(g, roots, 80);
    expect(roots.map(uci)).toContain(uci(result));
  } finally { client.dispose(); }
}, 25000);
