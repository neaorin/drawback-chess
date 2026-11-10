import { describe, expect, it } from 'vitest';
import { index, newGame, type Color, type DrawbackId, type Kind, type Move } from '../src/game';
import { preview, randomNumber, shade } from '../src/drawback-helpers';
import { TEMPORAL_IDS, TEMPORAL_SALTS, temporalMoves } from '../src/drawback-temporal';
import type { PlayerMemory, RuleContext, RuleEvent, RuleState } from '../src/drawback-types';

const move = (from: string, to: string, capture?: string): Move => ({
  from: index(from), to: index(to), ...(capture ? { capture: index(capture) } : {}),
});
const event = (from: string, to: string, extra: Partial<RuleEvent> = {}): RuleEvent => ({
  color: 'w', kind: 'r', pieceId: index(from) + 1, from: index(from), to: index(to), ...extra,
});
function context(drawback: string, moves: Move[], color: Color = 'w'): RuleContext {
  const g = newGame('horse', 'horse', 12345);
  g.board.fill(null);
  const pieces: Record<string, `${Color}${Kind}`> = {
    a1: 'wr', b1: 'wn', c1: 'wb', d1: 'wq', e1: 'wk', a2: 'wp',
    a7: 'bp', b8: 'bn', c8: 'bb', d8: 'bq', h8: 'bk',
  };
  for (const [at, piece] of Object.entries(pieces)) {
    g.board[index(at)] = { color: piece[0] as Color, kind: piece[1] as Kind };
  }
  g.turn = color;
  g.drawbacks[color] = drawback as DrawbackId;
  const player = (): PlayerMemory => ({ checks: 0, kissed: [], studied: [], studying: [], central: [], shape: 'b', achieved: [] });
  const params = { square: index('a3'), move: 4, color: 0, rank: 6, parity: 0, piece: 'n' as const };
  const state: RuleState = {
    seed: 12345, params: { w: { ...params }, b: { ...params } },
    pieces: Object.fromEntries(g.board.flatMap((p, at) => p ? [[at, { id: at + 1 }]] : [])),
    players: { w: player(), b: player() }, events: [], engineBans: {},
  };
  g.rules = state;
  return {
    g, color, moves, state, params: state.params[color], own: [], enemy: [],
    last: undefined, lastEnemy: undefined, after: m => preview(g, m),
  };
}
function finish(ctx: RuleContext) {
  ctx.last = ctx.own.at(-1);
  ctx.lastEnemy = ctx.enemy.at(-1);
  ctx.state.events = [...ctx.own, ...ctx.enemy];
  return ctx;
}
const own = (ctx: RuleContext, extra: Partial<RuleEvent> = {}) => {
  ctx.own.push(event('a1', 'a3', extra));
};
const enemy = (ctx: RuleContext, extra: Partial<RuleEvent> = {}) => {
  ctx.enemy.push(event('a7', 'a6', { color: 'b', kind: 'p', ...extra }));
};
const cap = { capture: index('a7'), captured: 'p' as const };
type Scenario = {
  id: typeof TEMPORAL_IDS[number];
  good: Move;
  bad: Move;
  setup?: (ctx: RuleContext) => void;
};
const quiet = move('a1', 'a3'), pawnCapture = move('a1', 'a7', 'a7');
const knightMove = move('b1', 'c3'), queenMove = move('d1', 'd3');
const kingMove = move('e1', 'e2'), kingCapture = move('a1', 'h8', 'h8');
const bishopCapture = move('c1', 'b8', 'b8');

const scenarios: Scenario[] = [
  { id: 'absolution', good: quiet, bad: pawnCapture, setup: c => { c.state.pieces[index('a1')].penitent = true; } },
  { id: 'barbarian-rage', good: pawnCapture, bad: quiet, setup: c => own(c, cap) },
  { id: 'battle-fatigue', good: quiet, bad: pawnCapture, setup: c => { c.state.pieces[index('a1')].fatigued = true; } },
  { id: 'bipartisanship', good: move('a1', 'a3'), bad: move('a1', 'b3'), setup: c => own(c, { from: index('a1'), to: index('b3') }) },
  { id: 'bloodthirsty', good: pawnCapture, bad: quiet, setup: c => { c.g.turns.w = 3; own(c); own(c); } },
  { id: 'boxing-with-shadows', good: move('a1', 'a7'), bad: quiet, setup: c => enemy(c) },
  { id: 'checkers', good: pawnCapture, bad: quiet },
  { id: 'colorblind', good: move('a1', 'a3'), bad: move('a1', 'b3'), setup: c => {
    const forbidden = randomNumber(c.state.seed, 'w', 0, TEMPORAL_SALTS.colorblind) % 2;
    if (shade(c.moves[0].to) === forbidden) c.moves.reverse();
  } },
  { id: 'comfort-zone', good: quiet, bad: knightMove },
  { id: 'cowardly', good: move('b1', 'b1'), bad: quiet, setup: c => {
    c.moves[0] = move('a2', 'a1'); enemy(c, cap);
  } },
  { id: 'cowering-in-fear', good: queenMove, bad: knightMove, setup: c => enemy(c, { ...cap, captured: 'r' }) },
  { id: 'crossing-the-rubicon', good: move('a1', 'a5'), bad: quiet, setup: c => own(c, { to: index('a6') }) },
  { id: 'death-wish', good: move('e1', 'c7'), bad: quiet },
  { id: 'diplomatic-immunity', good: quiet, bad: pawnCapture, setup: c => enemy(c, { to: index('a7') }) },
  { id: 'doctor-octopus', good: kingCapture, bad: pawnCapture, setup: c => { for (let n = 0; n < 8; n++) own(c, cap); } },
  { id: 'escort-mission', good: move('e1', 'a7', 'a7'), bad: pawnCapture },
  { id: 'evil-twin', good: move('b1', 'b8', 'b8'), bad: pawnCapture },
  { id: 'expedition', good: quiet, bad: knightMove, setup: c => { c.g.turns.w = 3; } },
  { id: 'eye-for-an-eye', good: pawnCapture, bad: quiet, setup: c => enemy(c, cap) },
  { id: 'fixation', good: quiet, bad: knightMove, setup: c => own(c) },
  { id: 'flatterer', good: move('a2', 'a3'), bad: quiet, setup: c => enemy(c) },
  { id: 'gambler', good: quiet, bad: knightMove, setup: c => {
    const kinds: Kind[] = ['p', 'n', 'b', 'r', 'q', 'k'];
    const banned = kinds[randomNumber(c.state.seed, 'w', 0, TEMPORAL_SALTS.gambler) % 6];
    c.g.board[c.moves[0].from] = { color: 'w', kind: kinds[(kinds.indexOf(banned) + 1) % 6] };
    c.g.board[c.moves[1].from] = { color: 'w', kind: banned };
  } },
  { id: 'glorious-battle', good: pawnCapture, bad: quiet, setup: c => { c.g.turns.w = 3; } },
  { id: 'going-the-distance', good: pawnCapture, bad: quiet, setup: c => enemy(c, { to: index('a3') }) },
  { id: 'guerilla-tactics', good: move('a1', 'a2'), bad: quiet, setup: c => own(c, { ...cap, from: index('a2'), pieceId: index('a1') + 1 }) },
  { id: 'haunted', good: quiet, bad: pawnCapture, setup: c => own(c, { ...cap, to: cap.capture }) },
  { id: 'hedonic-treadmill', good: queenMove, bad: knightMove, setup: c => enemy(c, { kind: 'r' }) },
  { id: 'hipster', good: quiet, bad: move('a2', 'a3'), setup: c => enemy(c) },
  { id: 'hopscotch', good: quiet, bad: move('a1', 'b3'), setup: c => own(c, { to: index('b3') }) },
  { id: 'irresistible', good: move('a1', 'g7'), bad: quiet },
  { id: 'jumpy', good: queenMove, bad: quiet },
  { id: 'ladies-first', good: quiet, bad: kingMove },
  { id: 'left-to-right', good: move('a1', 'b3'), bad: quiet, setup: c => own(c) },
  { id: 'leveling-up', good: pawnCapture, bad: move('a1', 'b8', 'b8') },
  { id: 'monkey-see', good: bishopCapture, bad: pawnCapture, setup: c => enemy(c, { ...cap, kind: 'b' }) },
  { id: 'nurturer', good: pawnCapture, bad: kingCapture },
  { id: 'obsession', good: quiet, bad: knightMove, setup: c => {
    c.moves[0] = { from: index('a1'), to: randomNumber(c.state.seed, 'w', 0, TEMPORAL_SALTS.obsession) % 64 };
    c.moves[1] = { from: index('b1'), to: (c.moves[0].to + 1) % 64 };
  } },
  { id: 'oddball', good: quiet, bad: pawnCapture, setup: c => { c.g.turns.w = 1; } },
  { id: 'ooh-shiny', good: pawnCapture, bad: quiet },
  { id: 'out-of-breath', good: quiet, bad: kingMove, setup: c => own(c, { kind: 'k' }) },
  { id: 'pacman', good: pawnCapture, bad: bishopCapture },
  { id: 'prince-charming', good: knightMove, bad: queenMove },
  { id: 'queen-bee', good: quiet, bad: queenMove, setup: c => own(c, { ...cap, kind: 'q' }) },
  { id: 'queen-disguise', good: queenMove, bad: move('d1', 'e2'), setup: c => { c.state.pieces[index('d1')].queenMode = 'r'; } },
  { id: 'quicksand', good: quiet, bad: knightMove, setup: c => { c.state.pieces[index('b1')].frozen = true; } },
  { id: 'reconnaissance', good: pawnCapture, bad: bishopCapture, setup: c => { c.state.players.w.studied = ['p']; } },
  { id: 'relay-race', good: knightMove, bad: quiet, setup: c => own(c, { to: index('c2') }) },
  { id: 'religious-dispute', good: bishopCapture, bad: quiet, setup: c => enemy(c, { kind: 'b' }) },
  { id: 'remorseful', good: quiet, bad: pawnCapture, setup: c => own(c, cap) },
  { id: 'rising-water', good: move('a2', 'a3'), bad: quiet, setup: c => { c.g.turns.w = 10; } },
  { id: 'royal-jubilee', good: queenMove, bad: quiet, setup: c => own(c, { ...cap, captured: 'n' }) },
  { id: 'savior-complex', good: queenMove, bad: quiet, setup: c => { c.g.board[index('e8')] = { color: 'b', kind: 'r' }; } },
  { id: 'scorched-earth', good: knightMove, bad: quiet, setup: c => own(c, { from: index('a3') }) },
  { id: 'shellshocked', good: queenMove, bad: quiet, setup: c => enemy(c, { ...cap, capture: index('a2') }) },
  { id: 'simon-says', good: quiet, bad: move('a1', 'b3'), setup: c => enemy(c, { to: index('a3') }) },
  { id: 'simplifier', good: bishopCapture, bad: pawnCapture },
  { id: 'skittish', good: kingMove, bad: quiet, setup: c => { c.g.board[index('e8')] = { color: 'b', kind: 'r' }; } },
  { id: 'spice-of-life', good: knightMove, bad: quiet, setup: c => own(c) },
  { id: 'stir-crazy', good: kingMove, bad: quiet, setup: c => { for (let n = 0; n < 4; n++) own(c); } },
  { id: 'superstitious', good: quiet, bad: pawnCapture, setup: c => enemy(c, { ...cap, to: cap.capture }) },
  { id: 'the-scent-of-blood', good: pawnCapture, bad: quiet },
  { id: 'theocracy', good: bishopCapture, bad: pawnCapture, setup: c => { c.g.turns.w = 1; } },
  { id: 'torpedos', good: move('a2', 'a3'), bad: quiet, setup: c => own(c, { kind: 'p', pieceId: index('a2') + 1 }) },
  { id: 'triple-play', good: pawnCapture, bad: kingCapture },
  { id: 'truant', good: knightMove, bad: quiet, setup: c => own(c) },
  { id: 'turn-the-other-cheek', good: quiet, bad: pawnCapture, setup: c => enemy(c, { ...cap, to: index('a7') }) },
  { id: 'unlucky', good: quiet, bad: knightMove, setup: c => {
    const sorted = Array.from({ length: 64 }, (_, at) => at).sort((a, b) =>
      randomNumber(c.state.seed, 'w', 0, 100 + a) - randomNumber(c.state.seed, 'w', 0, 100 + b) || a - b);
    c.moves[0] = { from: index('a1'), to: sorted[32] };
    c.moves[1] = { from: index('b1'), to: sorted[0] };
  } },
  { id: 'unspooling', good: quiet, bad: pawnCapture, setup: c => {
    for (let n = 0; n < 7; n++) own(c, { from: index('a1'), to: index('h8') });
  } },
  { id: 'velociraptor', good: pawnCapture, bad: bishopCapture, setup: c => enemy(c) },
  { id: 'winds-of-fate', good: quiet, bad: move('b1', 'c3'), setup: c => {
    const banned = randomNumber(c.state.seed, 'w', 0, TEMPORAL_SALTS.winds) % 2 === 0 ? -1 : 1;
    c.moves[1] = move('b1', banned === -1 ? 'a3' : 'c3');
  } },
  { id: 'windup-toys', good: quiet, bad: knightMove, setup: c => { c.g.turns.w = 12; } },
  { id: 'you-best-not-miss', good: kingCapture, bad: pawnCapture, setup: c => own(c, { gaveCheck: true } as Partial<RuleEvent>) },
];

describe('temporal drawback branches', () => {
  it('covers exactly the exported IDs', () => {
    expect(scenarios.map(s => s.id).sort()).toEqual([...TEMPORAL_IDS].sort());
    expect(new Set(TEMPORAL_IDS).size).toBe(TEMPORAL_IDS.length);
  });
  it.each(scenarios)('$id accepts the preferred move and rejects the prohibited move', scenario => {
    const c = context(scenario.id, [{ ...scenario.good }, { ...scenario.bad }]);
    scenario.setup?.(c);
    const [good, bad] = c.moves;
    const result = temporalMoves(finish(c));
    expect(result).toContainEqual(good);
    expect(result).not.toContainEqual(bad);
  });
  it('leaves unhandled IDs unchanged', () => {
    const c = context('fog', [quiet, pawnCapture]);
    expect(temporalMoves(c)).toBe(c.moves);
  });
});

describe('conditional and forced restrictions', () => {
  const forced = [
    'barbarian-rage', 'boxing-with-shadows', 'checkers', 'comfort-zone', 'death-wish',
    'escort-mission', 'evil-twin', 'guerilla-tactics', 'irresistible', 'jumpy',
    'obsession', 'ooh-shiny', 'pacman', 'prince-charming', 'relay-race', 'simplifier', 'torpedos',
  ];
  it.each(forced)('%s falls back when the preferred move is unavailable', id => {
    const scenario = scenarios.find(s => s.id === id)!;
    const c = context(id, [{ ...scenario.good }, { ...scenario.bad }]);
    scenario.setup?.(c);
    c.moves = [c.moves[1]];
    expect(temporalMoves(finish(c))).toEqual(c.moves);
  });
  it.each(['bloodthirsty', 'expedition', 'eye-for-an-eye', 'glorious-battle', 'religious-dispute', 'savior-complex', 'stir-crazy', 'you-best-not-miss'])(
    '%s has no fallback for a strict obligation', id => {
      const scenario = scenarios.find(s => s.id === id)!;
      const c = context(id, [{ ...scenario.good }, { ...scenario.bad }]);
      scenario.setup?.(c);
      c.moves = [c.moves[1]];
      expect(temporalMoves(finish(c))).toEqual([]);
    });
  it.each(['boxing-with-shadows', 'cowardly', 'diplomatic-immunity', 'eye-for-an-eye', 'flatterer',
    'going-the-distance', 'hedonic-treadmill', 'hipster', 'religious-dispute', 'shellshocked', 'simon-says',
    'turn-the-other-cheek'])('%s does not invent an opponent move on turn one', id => {
      const c = context(id, [quiet, pawnCapture, knightMove]);
      expect(temporalMoves(c)).toEqual(c.moves);
    });
  it('does not impose Bloodthirsty until turn four or after a recent capture', () => {
    const c = context('bloodthirsty', [quiet, pawnCapture]);
    own(c); own(c);
    c.g.turns.w = 2;
    expect(temporalMoves(finish(c))).toEqual(c.moves);
    c.g.turns.w = 3;
    c.own[1].capture = index('a7');
    expect(temporalMoves(finish(c))).toEqual(c.moves);
  });
  it('treats a quiet move as resetting Remorseful and Barbarian Rage', () => {
    for (const id of ['remorseful', 'barbarian-rage']) {
      const c = context(id, [quiet, pawnCapture]);
      own(c, cap); own(c);
      expect(temporalMoves(finish(c))).toEqual(c.moves);
    }
  });
  it('allows the first twelve personal Windup Toys moves', () => {
    const c = context('windup-toys', [quiet, knightMove]);
    c.g.turns.w = 11;
    expect(temporalMoves(c)).toEqual(c.moves);
  });
  it('uses the entire capture history for cowering, not only the previous enemy turn', () => {
    const c = context('cowering-in-fear', [quiet, queenMove]);
    enemy(c, { ...cap, captured: 'q' }); enemy(c);
    expect(temporalMoves(finish(c))).toEqual([queenMove]);
  });
  it('uses stable identity, not a vacated square, for Truant and Fixation', () => {
    for (const id of ['truant', 'fixation']) {
      const c = context(id, [quiet, knightMove]);
      own(c, { pieceId: c.state.pieces[index('b1')].id, to: index('b1') });
      expect(temporalMoves(finish(c))).toEqual(id === 'truant' ? [quiet] : [knightMove]);
    }
  });
  it('Fixation permits switching pawn/non-pawn classes', () => {
    const c = context('fixation', [quiet, move('a2', 'a3')]);
    own(c);
    expect(temporalMoves(finish(c))).toEqual(c.moves);
  });
  it('Irresistible always includes a king capture alongside an adjacent move', () => {
    const c = context('irresistible', [quiet, move('a1', 'g7'), kingCapture]);
    expect(temporalMoves(c)).toEqual(c.moves.slice(1));
  });
  it('does not force Death Wish while already checked', () => {
    const c = context('death-wish', [quiet, kingMove]);
    c.g.board[index('e8')] = { color: 'b', kind: 'r' };
    expect(temporalMoves(c)).toEqual(c.moves);
  });
  it('Ooh Shiny does not force an exposed capture', () => {
    const c = context('ooh-shiny', [quiet, move('a1', 'b8', 'b8')]);
    c.g.board[index('b7')] = { color: 'b', kind: 'r' };
    expect(temporalMoves(c)).toEqual(c.moves);
  });
  it('permits a diplomatically immune piece after its capturing move', () => {
    const c = context('diplomatic-immunity', [quiet, pawnCapture]);
    enemy(c, { ...cap, to: index('a7') });
    expect(temporalMoves(finish(c))).toEqual(c.moves);
  });
  it('uses destination rather than victim square for historical en passant bans', () => {
    for (const id of ['haunted', 'superstitious']) {
      const c = context(id, [move('a1', 'a5'), move('a1', 'a6')]);
      (id === 'haunted' ? own : enemy)(c, { capture: index('a5'), to: index('a6'), captured: 'p' });
      expect(temporalMoves(finish(c))).toEqual([c.moves[0]]);
    }
  });
  it('allows Leveling Up after the predecessor was captured', () => {
    const c = context('leveling-up', [move('a1', 'b8', 'b8')]);
    own(c, cap);
    expect(temporalMoves(finish(c))).toEqual(c.moves);
  });
  it('unlocks king captures after a promotion or three requested pieces', () => {
    const nurturer = context('nurturer', [kingCapture]);
    own(nurturer, { promotion: 'n', kind: 'p' });
    expect(temporalMoves(finish(nurturer))).toEqual(nurturer.moves);
    const triple = context('triple-play', [kingCapture]);
    triple.g.board[index('c3')] = { color: 'w', kind: 'n' };
    triple.g.board[index('d3')] = { color: 'w', kind: 'n' };
    expect(temporalMoves(triple)).toEqual(triple.moves);
  });
  it('supports diagonal Queen Disguise and an uncommitted queen', () => {
    const c = context('queen-disguise', [queenMove, move('d1', 'e2')]);
    expect(temporalMoves(c)).toEqual(c.moves);
    c.state.pieces[index('d1')].queenMode = 'b';
    expect(temporalMoves(c)).toEqual([c.moves[1]]);
  });
  it('only remembers the last three enemy types for Velociraptor', () => {
    const c = context('velociraptor', [bishopCapture, pawnCapture]);
    enemy(c, { kind: 'n' }); enemy(c); enemy(c); enemy(c);
    expect(temporalMoves(finish(c))).toEqual([pawnCapture]);
  });
  it('permits other pieces to move under The Scent of Blood', () => {
    const c = context('the-scent-of-blood', [quiet, pawnCapture, knightMove]);
    expect(temporalMoves(c)).toEqual([pawnCapture, knightMove]);
  });
});

describe('orientation, turn boundaries and deterministic randomness', () => {
  it.each(['w', 'b'] as const)('orients backwards, Rubicon, left/right and water for %s', color => {
    const back = color === 'w' ? move('a3', 'a2') : move('h6', 'h7');
    const forward = color === 'w' ? move('a3', 'a4') : move('h6', 'h5');
    const c = context('cowardly', [back, forward], color);
    enemy(c, cap);
    expect(temporalMoves(finish(c))).toEqual([back]);
    c.g.drawbacks[color] = 'crossing-the-rubicon' as DrawbackId;
    c.moves = color === 'w' ? [move('a5', 'a6'), move('a5', 'a4')] : [move('h4', 'h3'), move('h4', 'h5')];
    expect(temporalMoves(c)).toEqual([c.moves[0]]);
    c.g.drawbacks[color] = 'left-to-right' as DrawbackId;
    own(c, { to: index(color === 'w' ? 'd4' : 'e5') });
    c.moves = color === 'w' ? [move('a1', 'e4'), move('a1', 'c4')] : [move('h8', 'd5'), move('h8', 'f5')];
    expect(temporalMoves(finish(c))).toEqual([c.moves[0]]);
    c.g.drawbacks[color] = 'rising-water' as DrawbackId;
    c.g.turns[color] = 10;
    c.moves = color === 'w' ? [move('a2', 'a3'), move('a1', 'a3')] : [move('h7', 'h6'), move('h8', 'h6')];
    expect(temporalMoves(c)).toEqual([c.moves[0]]);
  });
  it.each(['w', 'b'] as const)('resets Left to Right at the rightmost file for %s', color => {
    const c = context('left-to-right', [quiet, knightMove], color);
    own(c, { to: index(color === 'w' ? 'h4' : 'a5') });
    expect(temporalMoves(finish(c))).toEqual(c.moves);
  });
  it('raises water after exactly ten completed personal turns', () => {
    const c = context('rising-water', [quiet, move('a2', 'a3')]);
    c.g.turns.w = 9;
    expect(temporalMoves(c)).toEqual(c.moves);
    c.g.turns.w = 20;
    expect(temporalMoves(c)).toEqual([]);
  });
  it.each(['w', 'b'] as const)('bans exactly 32 Unlucky squares deterministically for %s', color => {
    const c = context('unlucky', Array.from({ length: 64 }, (_, to) => ({ from: index('a1'), to })), color);
    const first = temporalMoves(c);
    expect(first).toHaveLength(32);
    expect(temporalMoves(c)).toEqual(first);
    c.g.turns[color]++;
    expect(temporalMoves(c)).not.toEqual(first);
    expect(temporalMoves(c)).toHaveLength(32);
  });
  it.each(['colorblind', 'gambler', 'obsession', 'winds-of-fate'])('%s remains stable for repeated evaluation', id => {
    const c = context(id, [quiet, pawnCapture, knightMove, queenMove, kingMove]);
    expect(temporalMoves(c)).toEqual(temporalMoves(c));
  });
  it('checks both castling relocations for frozen pieces and flooded home ranks', () => {
    const castle = { ...move('e1', 'g1'), castle: { rookFrom: index('h1'), rookTo: index('f1') } };
    const c = context('quicksand', [castle, quiet]);
    c.g.board[index('h1')] = { color: 'w', kind: 'r' };
    c.state.pieces[index('h1')] = { id: 100, frozen: true };
    expect(temporalMoves(c)).toEqual([quiet]);
    c.g.drawbacks.w = 'rising-water' as DrawbackId;
    c.g.turns.w = 10;
    expect(temporalMoves(c)).toEqual([]);
  });
  it('uses personal turn parity for both sides', () => {
    for (const color of ['w', 'b'] as const) {
      const c = context('oddball', [quiet, pawnCapture], color);
      expect(temporalMoves(c)).toEqual(c.moves);
      c.g.turns[color] = 1;
      expect(temporalMoves(c)).toEqual([quiet]);
      c.g.drawbacks[color] = 'theocracy' as DrawbackId;
      c.params.parity = 1;
      c.g.turns[color] = 0;
      expect(temporalMoves(c)).toEqual([quiet]);
    }
  });
});
