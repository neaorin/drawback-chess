import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { chooseAI, stockfishRoots, StockfishClient, variantMove, type EnginePort } from './ai';
import { DRAWBACKS, index, legalMoves, newGame, play, uci, type Game } from './game';

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
  it.each(DRAWBACKS)('returns only permitted standard roots for $name', d => {
    const g = newGame(d.id, 'horse');
    const allowed = new Set(legalMoves(g).map(uci));
    if (d.id === 'fog') expect(stockfishRoots(g)).toEqual([]);
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
  });
  it('variant search obeys its own drawback', () => {
    for (const d of DRAWBACKS) {
      const g = newGame(d.id, 'horse');
      expect(legalMoves(g).map(uci)).toContain(uci(variantMove(g)));
    }
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
      let g = newGame(d.id, 'command');
      for (let turn = 0; turn < 60 && !g.result; turn++) {
        const m = variantMove(g, 1);
        expect(legalMoves(g).map(uci)).toContain(uci(m));
        g = play(g, m);
        if (!g.result) expect(g.board.filter(p => p?.kind === 'k')).toHaveLength(2);
      }
    }
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
