import { describe, expect, it } from 'vitest';
import { DRAWBACKS, drawbackMoveInfo, index, newGame, type Color, type DrawbackId, type Game, type Kind } from '../src/game';
import { initialRules } from '../src/drawback-state';
import type { RuleEvent } from '../src/drawback-types';

function position(id: DrawbackId, color: Color = 'w', pieces: Record<string, `${Color}${Kind}`> = {}): Game {
  const g = newGame(id, id, 42);
  g.board.fill(null);
  for (const [at, text] of Object.entries({ h1: 'wk', h8: 'bk', ...pieces })) {
    g.board[index(at)] = { color: text[0] as Color, kind: text[1] as Kind };
  }
  g.turn = color;
  g.rights = { w: { king: false, queen: false }, b: { king: false, queen: false } };
  g.rules = initialRules(g, 42);
  return g;
}

function event(color: Color, overrides: Partial<RuleEvent> = {}): RuleEvent {
  return { color, kind: 'p', pieceId: 10, from: index('a2'), to: index('a3'), ...overrides };
}

const suppressed = [
  'abstinence', 'active-volcano', 'always-check-it-might-be-mate', 'atomic-bomb',
  'bishop-fan-club', 'blinded-by-the-sun', 'boastful', 'body-snatcher',
  'bridge-over-troubled-water', 'castle', 'cess', 'champing-at-the-bit',
  'cheerleaders', 'chivalry', 'closed-book', 'conscientious-objectors',
  'control-center', 'covering-fire', 'crenellations', 'crossing-the-rubicon',
  'drag', 'edgelord', 'eisoptrophobia', 'elephants-fear-mice', 'entrenched',
  'exclusivity-clause', 'false-prophets', 'far-sighted', 'femme-fatale', 'fog',
  'forward-march', 'friendly-fire', 'gloomstalker', 'haunted', 'hold-them-back',
  'homeland-security', 'horse', 'indecisive', 'inside-the-lines', 'ivory-tower',
  'just-passing-through', 'lame-duck', 'leaps-and-bounds', 'left-for-dead',
  'lethal-attraction', 'messy-divorce', 'modest', 'my-kingdom-for-a-horse',
  'no-shuffling', 'noblesse-oblige', 'octomom', 'outflanked', 'pack-mentality',
  'paranoid', 'pawn-battle', 'peons-first', 'professional-courtesy',
  'protected-pawns', 'punching-down', 'quicksand', 'reflective', 'respectful',
  'rook-fan-club', 'royal-berth', 'scorched-earth',
  'separation-anxiety', 'separation-of-church-and-state', 'shadow-queen',
  'sibling-rivalry', 'simp', 'snipers', 'social-distancing', 'spread-out',
  'stage-fright', 'stand-your-ground', 'stay-at-home-mom', 'stop-stalling',
  'superstitious', 'thunderdome', 'torchlight', 'tower-defense',
  'trophy-wife', 'true-gentleman', 'true-love', 'unlucky', 'unrequited-love',
  'vegan', 'whites-of-their-eyes',
] as const satisfies readonly DrawbackId[];

describe('situational messages', () => {
  it.each(['w', 'b'] as const)('shows Theocracy while bishop-only captures are active for %s', color => {
    const g = position('theocracy', color, {
      a1: color === 'w' ? 'wr' : 'br', a8: color === 'w' ? 'bp' : 'wp',
    });
    g.rules!.params[color].parity = 1;
    expect(drawbackMoveInfo(g)).toBe('Can only capture with bishops.');
    g.turns[color] = 1;
    expect(drawbackMoveInfo(g)).toBeNull();
    g.turns[color] = 0;
    g.board[index('a8')] = null;
    if (color === 'b') {
      g.board[index('h1')] = null;
      g.board[index('h2')] = { color: 'w', kind: 'k' };
    }
    expect(drawbackMoveInfo(g)).toBe('Can only capture with bishops.');
  });
  it.each(['w', 'b'] as const)('lists Velociraptor capture types from the last three enemy moves for %s', color => {
    const g = position('velociraptor', color);
    const opponent = color === 'w' ? 'b' : 'w';
    expect(drawbackMoveInfo(g)).toBe('Can capture none.');
    g.rules!.events = [
      event(opponent, { kind: 'q' }),
      event(color, { kind: 'k' }),
      event(opponent, { kind: 'p' }),
      event(color, { kind: 'b' }),
      event(opponent, { kind: 'n' }),
      event(opponent, { kind: 'r' }),
    ];
    expect(drawbackMoveInfo(g)).toBe('Can capture pawns, knights, rooks.');
    g.rules!.events.push(event(opponent, { kind: 'n' }));
    expect(drawbackMoveInfo(g)).toBe('Can capture knights, rooks.');
    g.rules!.events.push(event(opponent, { kind: 'k' }));
    expect(drawbackMoveInfo(g)).toBe('Can capture rooks, knights, kings.');
  });
  it.each(['w', 'b'] as const)('shows checks left for Three Check for %s', color => {
    const g = position('three-check', color);
    for (const checks of [0, 1, 2]) {
      g.rules!.players[color].checks = checks;
      expect(drawbackMoveInfo(g)).toBe(`Checks left: ${3 - checks}.`);
    }
    g.rules!.players[color === 'w' ? 'b' : 'w'].checks = 2;
    g.rules!.players[color].checks = 0;
    expect(drawbackMoveInfo(g)).toBe('Checks left: 3.');
  });
  it.each(['w', 'b'] as const)('lists Monkey See capture piece types for %s', color => {
    const g = position('monkey-see', color, {
      a1: color === 'w' ? 'wr' : 'br',
      a8: color === 'w' ? 'bn' : 'wn',
      b1: color === 'w' ? 'wb' : 'bb',
      b8: color === 'w' ? 'bp' : 'wp',
      h1: color === 'w' ? 'wk' : 'bk',
      h8: color === 'w' ? 'bk' : 'wk',
    });
    const enemy = color === 'w' ? 'b' : 'w';
    expect(drawbackMoveInfo(g)).toBe('Cannot capture.');
    g.rules!.events.push(
      event(enemy, { kind: 'r', capture: index('a4') }),
      event(color, { kind: 'p', capture: index('b3') }),
      event(enemy, { kind: 'b', capture: index('c4') }),
      event(enemy, { kind: 'r', capture: index('d4') }),
      event(enemy, { kind: 'p' }),
    );
    expect(drawbackMoveInfo(g)).toBe('Can capture with rooks, bishops.');
  });
  it('suppresses static and loss-condition messages even when pieces and captures exist', () => {
    expect(suppressed.length).toBeGreaterThan(80);
    for (const id of suppressed) {
      const g = position(id, 'w', { a1: 'wr', a8: 'br', d4: 'wq', e5: 'bn' });
      for (const turns of [0, 5, 10, 20]) {
        g.turns.w = turns;
        expect(drawbackMoveInfo(g, 'w', index('d4')), id).toBeNull();
      }
    }
  });

  it('suppresses every rule for an off-turn viewer and after game over', () => {
    for (const d of DRAWBACKS) {
      const g = position(d.id);
      expect(drawbackMoveInfo(g, 'b'), d.name).toBeNull();
      g.result = { winner: 'w', reason: 'Finished' };
      expect(drawbackMoveInfo(g), d.name).toBeNull();
    }
  });

  it.each(['w', 'b'] as const)('shows capture parity only with a capture opportunity for %s', color => {
    for (const id of ['even', 'oddball', 'command'] as const) {
      const g = position(id, color);
      expect(drawbackMoveInfo(g)).toBeNull();
      g.board[index('a1')] = { color, kind: 'r' };
      g.board[index('a8')] = { color: color === 'w' ? 'b' : 'w', kind: 'r' };
      g.turns[color] = id === 'oddball' ? 1 : 0;
      expect(drawbackMoveInfo(g)).toBe('Cannot capture.');
    }
  });

  it.each(['checkers', 'escort-mission', 'evil-twin', 'pacman', 'simplifier', 'ooh-shiny'] as const)(
    '%s does not invent an if-able obligation without an opportunity', id => {
      expect(drawbackMoveInfo(position(id))).toBeNull();
    });

  it('shows short capture obligations when eligible', () => {
    const cases: [DrawbackId, Record<string, `${Color}${Kind}`>, string][] = [
      ['checkers', { a1: 'wr', a8: 'bp' }, 'Must capture.'],
      ['evil-twin', { a1: 'wr', a8: 'br' }, 'Must capture a matching piece type.'],
      ['pacman', { a1: 'wr', a8: 'bp' }, 'Must capture a pawn.'],
      ['simplifier', { a1: 'wr', a8: 'bq' }, 'Must capture.'],
      ['escort-mission', { g2: 'bp' }, 'Must capture with your king.'],
    ];
    for (const [id, pieces, text] of cases) expect(drawbackMoveInfo(position(id, 'w', pieces)), id).toBe(text);
  });

  it('only shows Bongcloud while its restriction excludes a move', () => {
    const g = position('bongcloud', 'w', { a1: 'wr' });
    expect(drawbackMoveInfo(g)).toBe('Must move a pawn or king.');
    g.board[index('h1')] = null;
    g.board[index('h2')] = { color: 'w', kind: 'k' };
    expect(drawbackMoveInfo(g)).toBeNull();
  });

  it.each(['w', 'b'] as const)('deadline windows count the last three personal moves for %s', color => {
    const cases: [DrawbackId, number, string][] = [
      ['siege', 20, 'capture an enemy rook'],
      ['fischer-random', 20, 'rearrange your non-pawns'],
      ['rook-on-the-seventh', 15, `move a rook to rank ${color === 'w' ? 7 : 2}`],
    ];
    for (const [id, deadline, objective] of cases) {
      const g = position(id, color);
      for (let turn = 1; turn <= deadline + 1; turn++) {
        g.turns[color] = turn - 1;
        const remaining = deadline - turn + 1;
        expect(drawbackMoveInfo(g), `${id} turn ${turn}`).toBe(remaining > 0 && remaining <= 3
          ? `${remaining} ${remaining === 1 ? 'move' : 'moves'} left to ${objective}.` : null);
      }
    }
  });

  it.each(['w', 'b'] as const)('uses the color-relative rook target despite a different saved rank for %s', color => {
    const g = position('rook-on-the-seventh', color);
    g.turns[color] = 14;
    const target = color === 'w' ? 'a7' : 'a2';
    const wrong = color === 'w' ? 'a2' : 'a7';
    g.rules!.params[color].rank = color === 'w' ? 2 : 7;
    g.rules!.events.push(event(color, { kind: 'r', to: index(wrong) }));
    expect(drawbackMoveInfo(g)).toBe(`1 move left to move a rook to rank ${color === 'w' ? 7 : 2}.`);
    g.rules!.events.push(event(color, { kind: 'r', to: index(target) }));
    expect(drawbackMoveInfo(g)).toBeNull();
  });

  it('hides deadline messages once historical objectives are achieved', () => {
    const g = position('siege');
    g.turns.w = 19;
    g.rules!.events.push(event('w', { captured: 'r', capture: index('a3') }));
    expect(drawbackMoveInfo(g)).toBeNull();
    g.drawbacks.w = 'fischer-random';
    g.rules!.players.w.achieved.push('fischer-random');
    expect(drawbackMoveInfo(g)).toBeNull();
    g.drawbacks.w = 'rook-on-the-seventh';
    g.turns.w = 14;
    g.rules!.params.w.rank = 7;
    g.rules!.events.push(event('w', { kind: 'r', to: index('a7') }));
    expect(drawbackMoveInfo(g)).toBeNull();
  });

  it('distinguishes occupying from keeping the Crusade target during its window', () => {
    const g = position('crusade');
    g.rules!.params.w = { ...g.rules!.params.w, square: index('d4'), move: 6 };
    for (const turns of [0, 4, 9, 10]) {
      g.turns.w = turns;
      expect(drawbackMoveInfo(g)).toBeNull();
    }
    for (let remaining = 4; remaining >= 1; remaining--) {
      g.turns.w = 9 - remaining;
      expect(drawbackMoveInfo(g)).toBe(`Must occupy d4 for the next ${remaining} ${remaining === 1 ? 'move' : 'moves'}.`);
    }
    g.board[index('d4')] = { color: 'w', kind: 'p' };
    expect(drawbackMoveInfo(g)).toBe('Must keep d4 occupied for the next 1 move.');
  });

  it.each(['w', 'b'] as const)('reports researched and researching capture types for %s', color => {
    const g = position('reconnaissance', color);
    expect(drawbackMoveInfo(g)).toBe('Can capture none, researching none.');
    const player = g.rules!.players[color];
    player.studying = ['n', 'b', 'n'];
    expect(drawbackMoveInfo(g)).toBe('Can capture none, researching knights, bishops.');
    player.studied = ['p', 'n', 'r', 'n'];
    player.studying = ['n', 'q'];
    expect(drawbackMoveInfo(g)).toBe('Can capture pawns, knights, rooks, researching queens.');
    player.studied.push('q');
    expect(drawbackMoveInfo(g)).toBe('Can capture pawns, knights, rooks, queens, researching none.');
  });

  it('reports only current blocked capture types for pairing', () => {
    const g = position('reconnaissance', 'w', { a1: 'wr', a8: 'bn' });
    g.drawbacks.w = 'now-kiss';
    expect(drawbackMoveInfo(g)).toBe('Cannot capture with rooks.');
    g.rules!.players.w.kissed.push('r');
    expect(drawbackMoveInfo(g)).toBeNull();
  });

  it('reports fatigued and penitent pieces at their current location', () => {
    const g = position('battle-fatigue', 'w', { a4: 'wr', a8: 'bp' });
    g.rules!.pieces[index('a4')].fatigued = true;
    expect(drawbackMoveInfo(g)).toBe('Cannot capture with rook on a4.');
    g.rules!.pieces[index('a4')].fatigued = false;
    expect(drawbackMoveInfo(g)).toBeNull();
    g.drawbacks.w = 'absolution';
    g.rules!.pieces[index('a4')].penitent = true;
    expect(drawbackMoveInfo(g)).toBe('Cannot capture with rook on a4.');
  });

  it('names the restricted rook rather than the king when castling is blocked', () => {
    const g = position('medusa', 'w', { h1: 'wr', e1: 'wk', h3: 'bq' });
    g.rights.w.king = true;
    expect(drawbackMoveInfo(g)).toBe('Cannot move rook on h1.');
    g.drawbacks.w = 'shellshocked';
    g.rules!.events.push(event('b', { capture: index('g2'), to: index('g2'), captured: 'p' }));
    expect(drawbackMoveInfo(g)).toBe('Cannot move rook on h1 this turn.');
  });

  it('does not show stale or irrelevant shape details', () => {
    const g = position('queen-disguise', 'w', { d4: 'wq' });
    g.rules!.pieces[index('d4')].queenMode = 'b';
    expect(drawbackMoveInfo(g)).toBeNull();
    expect(drawbackMoveInfo(g, 'w', index('d4'))).toBe('Queen moves like a bishop.');
    expect(drawbackMoveInfo(g, 'w', index('h1'))).toBeNull();
    g.drawbacks.w = 'shapeshifter';
    g.rules!.players.w.shape = 'n';
    expect(drawbackMoveInfo(g, 'w', index('d4'))).toBe('Cannot move queens.');
  });

  it('Scent of Blood is piece-specific, not a global capture obligation', () => {
    const g = position('the-scent-of-blood', 'w', { a1: 'wr', a8: 'bp' });
    expect(drawbackMoveInfo(g)).toBeNull();
    expect(drawbackMoveInfo(g, 'w', index('a1'))).toBe('This piece must capture if moved.');
    expect(drawbackMoveInfo(g, 'w', index('h1'))).toBeNull();
  });

  it('keeps budgets hidden until low or restrictive', () => {
    const g = position('doctor-octopus');
    expect(drawbackMoveInfo(g)).toBeNull();
    g.rules!.events = Array.from({ length: 5 }, () => event('w', { captured: 'p', capture: index('a3') }));
    expect(drawbackMoveInfo(g)).toBe('3 non-king captures remaining.');
    g.drawbacks.w = 'unspooling';
    g.rules!.events = Array.from({ length: 8 }, () => event('w', { from: index('a1'), to: index('f6') }));
    expect(drawbackMoveInfo(g)).toBe('Distance left: 20.');
  });

  it.each(['w', 'b'] as const)('always shows Unspooling distance left for %s', color => {
    const g = position('unspooling', color);
    expect(drawbackMoveInfo(g)).toBe('Distance left: 100.');
    g.rules!.events = [
      event(color, { from: index('a1'), to: index('f6') }),
      event(color === 'w' ? 'b' : 'w', { from: index('a8'), to: index('h1') }),
    ];
    expect(drawbackMoveInfo(g)).toBe('Distance left: 90.');
  });
});
