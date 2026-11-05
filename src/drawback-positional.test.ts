import { describe, expect, it } from 'vitest';
import { index, newGame, pseudoMoves, square, uci, type Color, type DrawbackId, type Game, type Kind, type Move } from './game';
import { preview } from './drawback-helpers';
import { POSITIONAL_IDS, positionalMoves } from './drawback-positional';
import type { RuleContext, RuleParameters, RuleState } from './drawback-types';

type Pieces = Record<string, `${Color}${Kind}`>;
type Scenario = {
  id: typeof POSITIONAL_IDS[number];
  pieces: Pieces;
  forbidden: string;
  allowed: string;
  params?: Partial<RuleParameters>;
};

function context(id: string | null, pieces: Pieces, color: Color = 'w', params: Partial<RuleParameters> = {}): RuleContext {
  const g = newGame('horse', 'horse');
  g.board.fill(null);
  for (const [at, piece] of Object.entries(pieces)) {
    g.board[index(at)] = { color: piece[0] as Color, kind: piece[1] as Kind };
  }
  g.turn = color;
  g.drawbacks = { w: null, b: null };
  g.drawbacks[color] = id as DrawbackId | null;
  const parameters: RuleParameters = { square: index('d3'), move: 4, color: 1, rank: 4, parity: 0, piece: 'n', ...params };
  const player = () => ({ checks: 0, kissed: [], studied: [], studying: [], central: [], shape: 'p' as const, achieved: [] });
  const state: RuleState = {
    seed: 1, params: { w: parameters, b: parameters }, pieces: {},
    players: { w: player(), b: player() }, events: [], engineBans: {},
  };
  return {
    g, color, params: parameters, state, moves: pseudoMoves(g, color),
    own: [], enemy: [], last: undefined, lastEnemy: undefined,
    after: (m: Move): Game => preview(g, m),
  };
}

const scenarios: Scenario[] = [
  { id: 'active-volcano', pieces: { a1: 'wr' }, forbidden: 'a1a2', allowed: 'a1b1', params: { square: index('a3') } },
  { id: 'bishop-fan-club', pieces: { d4: 'wq' }, forbidden: 'd4d5', allowed: 'd4e5' },
  { id: 'blinded-by-the-sun', pieces: { a1: 'wr' }, forbidden: 'a1d1', allowed: 'a1b1', params: { square: index('d4') } },
  { id: 'bongcloud', pieces: { e1: 'wk', a1: 'wr', a2: 'wp' }, forbidden: 'a1b1', allowed: 'a2a3' },
  { id: 'bridge-over-troubled-water', pieces: { a1: 'wr', d1: 'wr' }, forbidden: 'a1a8', allowed: 'd1d8' },
  { id: 'champing-at-the-bit', pieces: { a2: 'wp' }, forbidden: 'a2a3', allowed: 'a2a4' },
  { id: 'cheerleaders', pieces: { d4: 'wr', d6: 'bp', f4: 'bp', c3: 'wp', h1: 'wr', h3: 'bp' }, forbidden: 'h1h3', allowed: 'd4d6' },
  { id: 'chivalry', pieces: { a1: 'wr', a4: 'bq', d2: 'wn', f3: 'br' }, forbidden: 'a1a4', allowed: 'd2f3' },
  { id: 'conscientious-objectors', pieces: { d4: 'wp', e5: 'bp' }, forbidden: 'd4e5', allowed: 'd4d5' },
  { id: 'control-center', pieces: { a1: 'wr' }, forbidden: 'a1b1', allowed: 'a1c1' },
  { id: 'covering-fire', pieces: { a1: 'wr', a4: 'bp', d1: 'wr', d4: 'bp', c3: 'wn' }, forbidden: 'd1d4', allowed: 'a1a4' },
  { id: 'crenellations', pieces: { a2: 'wp' }, forbidden: 'a2a3', allowed: 'a2a4', params: { color: 0 } },
  { id: 'eat-your-vegetables', pieces: { a1: 'wr', a4: 'br', d1: 'wr', d4: 'bp', b7: 'bp', c7: 'bp', e7: 'bp', f7: 'bp' }, forbidden: 'a1a4', allowed: 'd1d4' },
  { id: 'eisoptrophobia', pieces: { a1: 'wr', a4: 'br', d1: 'wr', d4: 'bp' }, forbidden: 'a1a4', allowed: 'd1d4' },
  { id: 'elephants-fear-mice', pieces: { a1: 'wr', a4: 'bp', d4: 'wp', e5: 'bp' }, forbidden: 'a1a4', allowed: 'd4e5' },
  { id: 'entrenched', pieces: { a1: 'wr' }, forbidden: 'a1a4', allowed: 'a1a3' },
  { id: 'exclusivity-clause', pieces: { a1: 'wr', c2: 'wn' }, forbidden: 'a1a3', allowed: 'a1b1' },
  { id: 'eye-of-sauron', pieces: { a1: 'wr', a3: 'wp', d2: 'wn' }, forbidden: 'd2e4', allowed: 'd2f1' },
  { id: 'false-prophets', pieces: { c1: 'wb', f4: 'bp' }, forbidden: 'c1f4', allowed: 'c1d2' },
  { id: 'far-sighted', pieces: { a1: 'wr', a2: 'bp', d1: 'wr', d4: 'bp' }, forbidden: 'a1a2', allowed: 'd1d4' },
  { id: 'femme-fatale', pieces: { a1: 'wr', a4: 'bk', d1: 'wq' }, forbidden: 'a1a4', allowed: 'd1a4' },
  { id: 'forward-march', pieces: { d4: 'wr' }, forbidden: 'd4d3', allowed: 'd4e4' },
  { id: 'friendly-fire', pieces: { a1: 'wr', c2: 'wn' }, forbidden: 'a1a2', allowed: 'a1a3' },
  { id: 'get-down-mr-president', pieces: { e1: 'wk', e8: 'br', a1: 'wr' }, forbidden: 'e1f1', allowed: 'a1a2' },
  { id: 'gloomstalker', pieces: { a1: 'wr', a4: 'bp', d1: 'wr', d4: 'bp' }, forbidden: 'd1d4', allowed: 'a1a4' },
  { id: 'horse-eats-first', pieces: { a1: 'wr', a4: 'bp', d2: 'wn', f3: 'bp' }, forbidden: 'a1a4', allowed: 'd2f3' },
  { id: 'indecisive', pieces: { d4: 'wr', d6: 'bp', f4: 'bp', a1: 'wr', a3: 'bp' }, forbidden: 'd4d6', allowed: 'a1a3' },
  { id: 'inside-the-lines', pieces: { d4: 'wr', a2: 'wr' }, forbidden: 'd4d8', allowed: 'a2a3' },
  { id: 'just-passing-through', pieces: { a1: 'wr', a4: 'bp', d1: 'wr', d3: 'bp' }, forbidden: 'a1a4', allowed: 'd1d3' },
  { id: 'lame-duck', pieces: { e1: 'wk', a1: 'wr' }, forbidden: 'e1e2', allowed: 'a1a2' },
  { id: 'leading-the-charge', pieces: { d4: 'wn', a1: 'wr' }, forbidden: 'a1a5', allowed: 'a1a4' },
  { id: 'leaps-and-bounds', pieces: { a1: 'wr' }, forbidden: 'a1a2', allowed: 'a1a3' },
  { id: 'left-for-dead', pieces: { d4: 'wr', a4: 'bp', f4: 'bp' }, forbidden: 'd4f4', allowed: 'd4a4' },
  { id: 'lethal-attraction', pieces: { d4: 'wr', h8: 'bk' }, forbidden: 'd4d3', allowed: 'd4d5' },
  { id: 'medusa', pieces: { a1: 'wr', a8: 'bq', d1: 'wr' }, forbidden: 'a1a2', allowed: 'd1d2' },
  { id: 'messy-divorce', pieces: { d4: 'wr' }, forbidden: 'd4e4', allowed: 'd4c4' },
  { id: 'no-shuffling', pieces: { a1: 'wr' }, forbidden: 'a1b1', allowed: 'a1a2' },
  { id: 'noblesse-oblige', pieces: { d4: 'wq', d6: 'bp', f4: 'bq' }, forbidden: 'd4d6', allowed: 'd4f4' },
  { id: 'outflanked', pieces: { d4: 'wr', a4: 'bp', d6: 'bp' }, forbidden: 'd4a4', allowed: 'd4d6' },
  { id: 'pack-mentality', pieces: { a1: 'wr', c2: 'wp' }, forbidden: 'a1a2', allowed: 'a1b1' },
  { id: 'peons-first', pieces: { a1: 'wr', a2: 'wp', d1: 'wr' }, forbidden: 'a1b1', allowed: 'd1d2' },
  { id: 'power-cells', pieces: { a1: 'wr', b2: 'wp', c2: 'wp' }, forbidden: 'a1a4', allowed: 'a1a3' },
  { id: 'professional-courtesy', pieces: { a1: 'wr', a4: 'br', d4: 'wp', e5: 'bp' }, forbidden: 'a1a4', allowed: 'd4e5' },
  { id: 'protected-pawns', pieces: { a2: 'wp', c2: 'wn' }, forbidden: 'a2a4', allowed: 'a2a3' },
  { id: 'punching-down', pieces: { d4: 'wb', f6: 'br', b6: 'bn' }, forbidden: 'd4f6', allowed: 'd4b6' },
  { id: 'reflective', pieces: { a1: 'wr', a6: 'bp' }, forbidden: 'a1a2', allowed: 'a1a3' },
  { id: 'respectful', pieces: { a1: 'wr', d8: 'bk' }, forbidden: 'a1d1', allowed: 'a1b1' },
  { id: 'rook-fan-club', pieces: { d4: 'wq' }, forbidden: 'd4e5', allowed: 'd4d5' },
  { id: 'royal-berth', pieces: { e1: 'wk', a2: 'wr' }, forbidden: 'a2d2', allowed: 'a2c2' },
  { id: 'scouting-ahead', pieces: { d4: 'wp', a1: 'wr' }, forbidden: 'a1a5', allowed: 'a1a4' },
  { id: 'secret-garden', pieces: { d1: 'wr' }, forbidden: 'd1d3', allowed: 'd1d2' },
  { id: 'separation-anxiety', pieces: { e2: 'wk', d3: 'wp' }, forbidden: 'd3d4', allowed: 'e2e1' },
  { id: 'separation-of-church-and-state', pieces: { e1: 'wk', a5: 'wb' }, forbidden: 'a5d2', allowed: 'a5c3' },
  { id: 'shadow-queen', pieces: { d4: 'wq' }, forbidden: 'd4d5', allowed: 'd4d6' },
  { id: 'sibling-rivalry', pieces: { a1: 'wr', d2: 'br' }, forbidden: 'a1c1', allowed: 'a1b1' },
  { id: 'sleepy-king', pieces: { e1: 'wk', a1: 'wr' }, forbidden: 'e1e2', allowed: 'a1a2' },
  { id: 'snipers', pieces: { a1: 'wb', d4: 'bp', h1: 'wb', d5: 'bp' }, forbidden: 'a1d4', allowed: 'h1d5' },
  { id: 'social-distancing', pieces: { a1: 'wr', d2: 'bp' }, forbidden: 'a1c1', allowed: 'a1b1' },
  { id: 'spread-out', pieces: { a1: 'wr', d2: 'wn' }, forbidden: 'a1c1', allowed: 'a1b1' },
  { id: 'stage-fright', pieces: { d1: 'wr' }, forbidden: 'd1d4', allowed: 'd1d3' },
  { id: 'stand-your-ground', pieces: { a1: 'wr', a4: 'bp', d1: 'wr', d4: 'br' }, forbidden: 'a1a4', allowed: 'd1d4' },
  { id: 'stay-at-home-mom', pieces: { d1: 'wq' }, forbidden: 'd1d3', allowed: 'd1d2' },
  { id: 'stop-stalling', pieces: { d4: 'wr' }, forbidden: 'd4e4', allowed: 'd4d5' },
  { id: 'thunderdome', pieces: { d4: 'wr', e5: 'bp' }, forbidden: 'd4d1', allowed: 'd4d3' },
  { id: 'torchlight', pieces: { a1: 'wr', c2: 'wp' }, forbidden: 'a1a2', allowed: 'a1b1' },
  { id: 'tower-defense', pieces: { a1: 'wr', d2: 'wn' }, forbidden: 'a1a2', allowed: 'd2f3' },
  { id: 'trophy-wife', pieces: { d4: 'wq', d6: 'bp' }, forbidden: 'd4d6', allowed: 'd4d5' },
  { id: 'true-gentleman', pieces: { d4: 'wr', d6: 'bq', f4: 'bp' }, forbidden: 'd4d6', allowed: 'd4f4' },
  { id: 'true-love', pieces: { e1: 'wk', d1: 'wq' }, forbidden: 'd1d3', allowed: 'd1d2' },
  { id: 'unrequited-love', pieces: { e1: 'wk', d1: 'wq' }, forbidden: 'e1f1', allowed: 'e1d2' },
  { id: 'vegan', pieces: { d4: 'wr', d6: 'bn', f4: 'bp' }, forbidden: 'd4d6', allowed: 'd4f4' },
  { id: 'whites-of-their-eyes', pieces: { d4: 'wr', d7: 'bp', f4: 'bp' }, forbidden: 'd4d7', allowed: 'd4f4' },
];

const rotateSquare = (at: string) => square(63 - index(at));
const rotateMove = (move: string) => rotateSquare(move.slice(0, 2)) + rotateSquare(move.slice(2, 4)) + move.slice(4);
const rotatePieces = (pieces: Pieces): Pieces => Object.fromEntries(Object.entries(pieces).map(([at, piece]) =>
  [rotateSquare(at), `${piece[0] === 'w' ? 'b' : 'w'}${piece[1] as Kind}`]));
const selected = (ctx: RuleContext) => positionalMoves(ctx).map(uci);

describe('positional drawback filters', () => {
  it('covers exactly the assigned IDs without duplicates', () => {
    expect(new Set(scenarios.map(s => s.id))).toEqual(new Set(POSITIONAL_IDS));
    expect(new Set(POSITIONAL_IDS).size).toBe(POSITIONAL_IDS.length);
  });

  describe.each(['w', 'b'] as const)('playing as %s', color => {
    it.each(scenarios)('$id rejects a forbidden move and retains an allowed move', scenario => {
      const params = color === 'w' ? scenario.params : {
        ...scenario.params,
        square: 63 - (scenario.params?.square ?? index('d3')),
        rank: 9 - (scenario.params?.rank ?? 4),
      };
      const ctx = context(scenario.id, color === 'w' ? scenario.pieces : rotatePieces(scenario.pieces), color, params);
      const forbidden = color === 'w' ? scenario.forbidden : rotateMove(scenario.forbidden);
      const allowed = color === 'w' ? scenario.allowed : rotateMove(scenario.allowed);
      const candidates = ctx.moves.map(uci);
      expect(candidates, 'forbidden fixture must be a geometric move').toContain(forbidden);
      expect(candidates, 'allowed fixture must be a geometric move').toContain(allowed);
      const result = selected(ctx);
      expect(result).not.toContain(forbidden);
      expect(result).toContain(allowed);
    });
  });

  it.each([null, 'castle', 'command', 'even', 'alternator', 'horse', 'cess', 'fog', 'not-assigned'])(
    'leaves %s untouched', id => {
      const ctx = context(id, { e1: 'wk', a1: 'wr' });
      expect(positionalMoves(ctx)).toBe(ctx.moves);
    },
  );
});

describe('positional boundaries and geometry', () => {
  it('does not mutate the context, board, parameters or candidate moves', () => {
    for (const id of POSITIONAL_IDS) {
      const ctx = context(id, { e1: 'wk', h1: 'wr', a2: 'wp', d1: 'wq', a8: 'bk', c6: 'bb' });
      const before = JSON.stringify(ctx);
      positionalMoves(ctx);
      expect(JSON.stringify(ctx), id).toBe(before);
    }
  });

  it.each(['bishop-fan-club', 'rook-fan-club'] as const)('%s limits all four promotion variants', id => {
    const ctx = context(id, { a7: 'wp', b8: 'br' });
    expect(ctx.moves.filter(m => m.promotion)).toHaveLength(8);
    expect(selected(ctx).sort()).toEqual((id === 'bishop-fan-club'
      ? ['a7a8b', 'a7b8b'] : ['a7a8r', 'a7b8r']).sort());
  });

  it('does not count four promotions as four different attackers or capture choices', () => {
    const pieces: Pieces = { a7: 'wp', b8: 'br' };
    expect(selected(context('covering-fire', pieces))).not.toContain('a7b8q');
    expect(selected(context('exclusivity-clause', pieces))).toContain('a7b8q');
    expect(selected(context('indecisive', pieces))).toContain('a7b8q');
  });

  it('covering fire counts different pieces even if one capture is pinned', () => {
    const ctx = context('covering-fire', { e1: 'wk', e2: 'wn', e8: 'br', c1: 'wr', c3: 'bp' });
    // The pinned knight's geometry is enough: hidden legality must not be queried.
    expect(selected(ctx)).toContain('c1c3');
  });

  it('indecisive counts distinct capture destinations, not merely victim types', () => {
    const ctx = context('indecisive', { d4: 'wr', d6: 'bp', f4: 'bp' });
    expect(selected(ctx)).not.toContain('d4d6');
    expect(selected(ctx)).not.toContain('d4f4');
    expect(selected(ctx)).toContain('d4d5');
  });

  it('checks source pawn adjacency for cheerleaders and both endpoints for torchlight', () => {
    const pieces: Pieces = { a1: 'wr', c2: 'wp', h1: 'br' };
    expect(selected(context('cheerleaders', pieces))).not.toContain('a1h1');
    expect(selected(context('torchlight', pieces))).toContain('a1b1');
    expect(selected(context('torchlight', { a1: 'wr', b2: 'wp' }))).toContain('a1a8');
  });

  it('does not allow a moving piece to defend or accompany itself', () => {
    expect(selected(context('friendly-fire', { a1: 'wr' }))).toEqual([]);
    expect(selected(context('pack-mentality', { a1: 'wr' }))).toEqual([]);
    expect(selected(context('protected-pawns', { a2: 'wp' }))).toEqual([]);
    expect(selected(context('reflective', { a2: 'wr' }))).not.toContain('a2a7');
  });

  it('uses pawn attack geometry, not pawn forward movement, for defense and sunlight', () => {
    expect(selected(context('friendly-fire', { a1: 'wr', b2: 'wp' }))).toContain('a1a3');
    expect(selected(context('friendly-fire', { a1: 'wr', a2: 'wp' }))).not.toContain('a1b1');
    expect(selected(context('blinded-by-the-sun', { a2: 'wp' }, 'w', { square: index('a4') }))).toContain('a2a3');
    expect(selected(context('blinded-by-the-sun', { a2: 'wp' }, 'w', { square: index('b4') }))).not.toContain('a2a3');
  });

  it('forbids discovered attacks on the sun and discovered checks', () => {
    const pieces: Pieces = { a1: 'wr', a2: 'wn', a8: 'bk' };
    expect(selected(context('blinded-by-the-sun', pieces, 'w', { square: index('a8') }))).not.toContain('a2c3');
    expect(selected(context('respectful', pieces))).not.toContain('a2c3');
    expect(selected(context('respectful', pieces))).toContain('a1b1');
  });

  it.each(['get-down-mr-president', 'sleepy-king'] as const)('%s uses enemy attack geometry without their legality', id => {
    const ctx = context(id, { e1: 'wk', e8: 'br' });
    ctx.g.drawbacks.b = 'tower-defense' as DrawbackId;
    expect(selected(ctx).includes('e1d1')).toBe(id === 'sleepy-king');
  });

  it('Medusa freezes only pieces attacked by queens, including either rook in a castle', () => {
    const ctx = context('medusa', { e1: 'wk', h1: 'wr', h8: 'bq', d1: 'wr', d8: 'br' });
    expect(ctx.moves.some(m => m.castle)).toBe(true);
    expect(selected(ctx)).not.toContain('h1h2');
    expect(selected(ctx)).not.toContain('e1g1');
    expect(selected(ctx)).toContain('d1d2');
  });

  it('uses four diagonal steps as Snipers distance eight, and Manhattan distance for capture limits', () => {
    const ctx = context('snipers', { a1: 'wb', e5: 'bp' });
    expect(selected(ctx)).toContain('a1e5');
    expect(selected(context('snipers', { a1: 'wb', d4: 'bp' }))).not.toContain('a1d4');
    expect(selected(context('whites-of-their-eyes', { a1: 'wb', c3: 'bp' }))).not.toContain('a1c3');
    expect(selected(context('whites-of-their-eyes', { a1: 'wb', b2: 'bp' }))).toContain('a1b2');
    expect(selected(context('champing-at-the-bit', { d4: 'wp', e5: 'bp' }))).toContain('d4e5');
  });

  it.each(['eye-of-sauron', 'leading-the-charge', 'scouting-ahead'] as const)(
    '%s releases its advance restriction when no guiding piece remains', id => {
      expect(selected(context(id, { d1: 'wq' }))).toContain('d1d8');
    },
  );

  it('Eye of Sauron includes occupied rook squares and squares visible up to blockers', () => {
    expect(selected(context('eye-of-sauron', { a4: 'wr', a5: 'wp', d1: 'wq' }))).toContain('d1d4');
    expect(selected(context('eye-of-sauron', { a4: 'wr', a5: 'wp', d1: 'wq' }))).not.toContain('d1d5');
    expect(selected(context('eye-of-sauron', { a4: 'wr', a6: 'bp', d1: 'wq' }))).toContain('d1d6');
    expect(selected(context('eye-of-sauron', { a4: 'wr', a6: 'bp', d1: 'wq' }))).not.toContain('d1d7');
  });

  it('permits non-knight captures after the last knight is gone', () => {
    expect(selected(context('horse-eats-first', { a1: 'wr', a4: 'bp' }))).toContain('a1a4');
  });

  it('allows eating non-pawns at four or fewer enemy pawns, not five', () => {
    const pieces: Pieces = { a1: 'wr', a4: 'br', b7: 'bp', c7: 'bp', d7: 'bp', e7: 'bp' };
    expect(selected(context('eat-your-vegetables', pieces))).toContain('a1a4');
    expect(selected(context('eat-your-vegetables', { ...pieces, f7: 'bp' }))).not.toContain('a1a4');
  });

  it('implements king capture exceptions without treating every king capture as legal', () => {
    const pieces: Pieces = { d4: 'wp', e5: 'bk' };
    expect(selected(context('punching-down', pieces))).toContain('d4e5');
    expect(selected(context('femme-fatale', pieces))).not.toContain('d4e5');
    expect(selected(context('outflanked', { a1: 'wr', a8: 'bk' }))).toContain('a1a8');
    expect(selected(context('outflanked', { a1: 'wr', a8: 'bq' }))).not.toContain('a1a8');
  });

  it('Peons First blocks only the square directly behind a friendly pawn', () => {
    const pieces: Pieces = { a1: 'wr', b2: 'wp', d1: 'wr', d2: 'bp' };
    expect(selected(context('peons-first', pieces))).toContain('a1a2');
    expect(selected(context('peons-first', pieces))).toContain('d1d2');
    const pawn = context('peons-first', { a2: 'wp', a3: 'wp', b3: 'bp' });
    expect(pawn.moves.map(uci)).toContain('a2b3');
    expect(selected(pawn)).not.toContain('a2b3');
  });

  describe('bridge geometry', () => {
    it('allows landing on the four bridge squares but not the surrounding river', () => {
      const ctx = context('bridge-over-troubled-water', { d1: 'wr' });
      expect(selected(ctx)).toContain('d1d4');
      expect(selected(ctx)).toContain('d1d5');
      const otherFile = context('bridge-over-troubled-water', { e8: 'br' }, 'b');
      expect(selected(otherFile)).toContain('e8e4');
      expect(selected(otherFile)).toContain('e8e5');
      const river = context('bridge-over-troubled-water', { c1: 'wr' });
      expect(selected(river)).not.toContain('c1c4');
      expect(selected(river)).not.toContain('c1c5');
      expect(selected(ctx)).toContain('d1d3');
      expect(selected(ctx)).toContain('d1d6');
    });

    it('requires every traversed river square to be in the central two files', () => {
      expect(selected(context('bridge-over-troubled-water', { b2: 'wb' }))).toContain('b2f6');
      expect(selected(context('bridge-over-troubled-water', { a3: 'wb' }))).not.toContain('a3d6');
      expect(selected(context('bridge-over-troubled-water', { d3: 'wb' }))).not.toContain('d3g6');
      expect(selected(context('bridge-over-troubled-water', { c3: 'wb' }))).toContain('c3f6');
    });

    it('allows ordinary knight jumps away from the river', () => {
      const ctx = context('bridge-over-troubled-water', { b1: 'wn' });
      expect(selected(ctx)).toContain('b1c3');
      expect(selected(ctx)).toContain('b1a3');
    });

    it('requires knights leaping river squares to have both endpoints in d/e files', () => {
      // No knight can clear both river ranks from dry bank to dry bank.
      expect(selected(context('bridge-over-troubled-water', { d4: 'wn' }))).toContain('d4e6');
      expect(selected(context('bridge-over-troubled-water', { c4: 'wn' }))).not.toContain('c4d6');
      expect(selected(context('bridge-over-troubled-water', { d4: 'wn' }))).not.toContain('d4c6');
      expect(selected(context('bridge-over-troubled-water', { d3: 'wn' }))).toContain('d3e5');
    });
  });

  describe.each(['w', 'b'] as const)('castling constraints for %s', color => {
    const castles = (id: string, extra: Pieces = {}, params: Partial<RuleParameters> = {}) => {
      const rank = color === 'w' ? '1' : '8';
      const ctx = context(id, {
        [`e${rank}`]: `${color}k`, [`a${rank}`]: `${color}r`, [`h${rank}`]: `${color}r`, ...extra,
      }, color, params);
      expect(ctx.moves.filter(m => m.castle)).toHaveLength(2);
      return positionalMoves(ctx).filter(m => m.castle).map(m => m.to % 8).sort();
    };

    it.each([
      'bishop-fan-club', 'bongcloud', 'lame-duck', 'no-shuffling', 'spread-out',
      'stop-stalling', 'tower-defense', 'sleepy-king', 'true-love', 'unrequited-love',
    ])('%s excludes castling', id => {
      expect(castles(id)).toEqual([]);
    });

    it.each(['rook-fan-club', 'forward-march', 'leaps-and-bounds', 'bridge-over-troubled-water'])(
      '%s permits unobstructed castling', id => {
        expect(castles(id)).toEqual([2, 6]);
      },
    );

    it('limits the rook to two squares under Entrenched', () => {
      expect(castles('entrenched')).toEqual([6]);
    });

    it('checks both destinations under Control Center and both relocations under Messy Divorce', () => {
      expect(castles('control-center')).toEqual([2]);
      expect(castles('messy-divorce')).toEqual([6]);
    });

    it('rejects a forbidden rook landing square even if the king destination is safe', () => {
      const rank = color === 'w' ? '1' : '8';
      expect(castles('secret-garden', {}, { square: index(`f${rank}`) })).toEqual([2]);
      const volcanoRank = color === 'w' ? '2' : '7';
      expect(castles('active-volcano', {}, { square: index(`f${volcanoRank}`) })).toEqual([2]);
    });

    it('counts rook travel against Power Cells', () => {
      const rank = color === 'w' ? '2' : '7';
      expect(castles('power-cells', { [`a${rank}`]: `${color}p`, [`b${rank}`]: `${color}p` })).toEqual([6]);
    });

    it('does not place the castling rook next to the king under Royal Berth', () => {
      expect(castles('royal-berth')).toEqual([]);
    });

    it('evaluates king check at the start, not at the destination', () => {
      const rank = color === 'w' ? '8' : '1';
      const opponent = color === 'w' ? 'b' : 'w';
      expect(castles('get-down-mr-president', { [`e${rank}`]: `${opponent}r` })).toEqual([]);
      expect(castles('sleepy-king', { [`e${rank}`]: `${opponent}r` })).toEqual([2, 6]);
    });
  });

  it('treats the forbidden capture rank as an absolute rank for Black', () => {
    const ctx = context('just-passing-through', { a8: 'br', a4: 'wp', d8: 'br', d5: 'wp' }, 'b', { rank: 4 });
    expect(selected(ctx)).not.toContain('a8a4');
    expect(selected(ctx)).toContain('d8d5');
  });

  it('allows a pawn next to its king to stay adjacent, and allows the king to leave', () => {
    const ctx = context('separation-anxiety', { e3: 'wk', d3: 'wp' });
    expect(selected(ctx)).toContain('d3d4');
    expect(selected(ctx)).toContain('e3f2');
  });

  it('checks either color king or bishop for Separation of Church and State', () => {
    expect(selected(context('separation-of-church-and-state', { a5: 'wb', e1: 'bk' }))).not.toContain('a5d2');
    expect(selected(context('separation-of-church-and-state', { e1: 'wk', c3: 'bb' }))).not.toContain('e1d2');
    expect(selected(context('separation-of-church-and-state', { e1: 'wk', d2: 'bb' }))).toContain('e1d2');
  });

  it('uses the post-capture board for sibling rivalry and social distancing', () => {
    expect(selected(context('sibling-rivalry', { a1: 'wr', a4: 'br' }))).toContain('a1a4');
    expect(selected(context('sibling-rivalry', { a1: 'wr', a4: 'br', b5: 'br' }))).not.toContain('a1a4');
    expect(selected(context('social-distancing', { a1: 'wr', a4: 'bp', b5: 'br' }))).toContain('a1a4');
  });

  it('spread out permits pawn moves and adjacency to pawns but not other non-pawns', () => {
    expect(selected(context('spread-out', { a1: 'wr', b2: 'wp' }))).toContain('a1b1');
    expect(selected(context('spread-out', { a2: 'wp', b4: 'wr' }))).toContain('a2a3');
  });

  it('allows leaving the Thunderdome only when the moving piece is its sole occupant', () => {
    expect(selected(context('thunderdome', { c3: 'wr' }))).toContain('c3c1');
    expect(selected(context('thunderdome', { c3: 'wr', f6: 'bp' }))).not.toContain('c3c1');
    expect(selected(context('thunderdome', { c1: 'wr', f6: 'bp' }))).toContain('c1c3');
  });

  it.each(['true-love', 'unrequited-love'] as const)('%s forbids king movement without a queen', id => {
    expect(selected(context(id, { e1: 'wk' }))).toEqual([]);
  });

  it('True Love constrains king moves as well as queen moves', () => {
    const ctx = context('true-love', { e1: 'wk', d1: 'wq' });
    expect(selected(ctx)).toContain('e1d2');
    expect(selected(ctx)).not.toContain('e1f1');
  });

  it('Unrequited Love permits equal distances and forbids queens approaching their king', () => {
    const ctx = context('unrequited-love', { e1: 'wk', d3: 'wq' });
    expect(selected(ctx)).not.toContain('d3d2');
    expect(selected(ctx)).toContain('d3e4');
    expect(selected(ctx)).toContain('d3d4');
    expect(selected(ctx)).toContain('e1d1');
  });
});
