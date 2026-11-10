import { describe, expect, it } from 'vitest';
import { drawbackMoveInfo, index, legalMoves, newGame, play, type Color, type DrawbackId, type Game, type Kind } from '../src/game';
import { initialRules } from '../src/drawback-state';
import { variantMove } from '../src/ai';

function setup(id: DrawbackId, pieces: Record<string, `${Color}${Kind}`>): Game {
  const g = newGame(id, 'horse', 42);
  g.board.fill(null);
  for (const [at, text] of Object.entries({ h1: 'wk', h8: 'bk', ...pieces })) {
    g.board[index(at)] = { color: text[0] as Color, kind: text[1] as Kind };
  }
  g.rights = { w: { king: false, queen: false }, b: { king: false, queen: false } };
  g.rules = initialRules(g, 42);
  return g;
}
const step = (g: Game, from: string, to: string) => play(g, { from: index(from), to: index(to) });
const has = (g: Game, from: string, to: string) =>
  legalMoves(g).some(m => m.from === index(from) && m.to === index(to));
const reply = (g: Game) => step(g, g.board[index('h8')] ? 'h8' : 'g8', g.board[index('h8')] ? 'g8' : 'h8');

describe('piece identity and rule lifecycle', () => {
  it.each(['w', 'b'] as const)('shows the Windup Toys countdown and wound-down status for %s', color => {
    const g = setup('windup-toys', { a1: `${color}n` });
    g.turn = color;
    g.drawbacks[color] = 'windup-toys';
    for (let completed = 0; completed < 12; completed++) {
      g.turns[color] = completed;
      const remaining = 12 - completed;
      expect(drawbackMoveInfo(g)).toBe(remaining <= 3 ? `Only ${remaining} ${remaining === 1 ? 'move' : 'moves'} until the toys wind down` : null);
      expect(drawbackMoveInfo(g, color === 'w' ? 'b' : 'w')).toBeNull();
    }
    for (const completed of [12, 13, 20]) {
      g.turns[color] = completed;
      expect(drawbackMoveInfo(g)).toBe('Cannot move knights or bishops.');
    }
    g.result = { winner: color === 'w' ? 'b' : 'w', reason: 'No legal moves' };
    expect(drawbackMoveInfo(g)).toBeNull();
  });

  it.each(['w', 'b'] as const)('shows Glorious Battle countdown only during its four personal moves for %s', color => {
    const g = setup('glorious-battle', {});
    g.turn = color;
    g.drawbacks[color] = 'glorious-battle';
    g.rules!.params[color].move = 6;
    for (const completed of [0, 4, 9, 10]) {
      g.turns[color] = completed;
      expect(drawbackMoveInfo(g)).toBeNull();
    }
    for (let remaining = 4; remaining >= 1; remaining--) {
      g.turns[color] = 9 - remaining;
      expect(drawbackMoveInfo(g)).toBe(`Battle! Must capture for the next ${remaining} moves`);
      expect(drawbackMoveInfo(g, color === 'w' ? 'b' : 'w')).toBeNull();
    }
    g.result = { winner: color === 'w' ? 'b' : 'w', reason: 'No legal moves' };
    expect(drawbackMoveInfo(g)).toBeNull();
  });
  it.each(['w', 'b'] as const)('shows Expedition destination only on the scheduled personal move for %s', color => {
    const g = setup('expedition', {});
    g.turn = color;
    g.drawbacks[color] = 'expedition';
    g.rules!.params[color] = { ...g.rules!.params[color], move: 6, square: index('d4') };
    for (const completed of [0, 4, 6, 7]) {
      g.turns[color] = completed;
      expect(drawbackMoveInfo(g)).toBeNull();
    }
    g.turns[color] = 5;
    expect(drawbackMoveInfo(g)).toBe('Must move to d4.');
    expect(drawbackMoveInfo(g, color === 'w' ? 'b' : 'w')).toBeNull();
    g.result = { winner: color === 'w' ? 'b' : 'w', reason: 'No legal moves' };
    expect(drawbackMoveInfo(g)).toBeNull();
  });

  it('shows the required destination for Boxing with Shadows only when reachable', () => {
    let g = setup('boxing-with-shadows', { a1: 'wr', a4: 'br' });
    expect(drawbackMoveInfo(g)).toBeNull();
    g.turn = 'b';
    g = step(g, 'a4', 'b4');
    expect(drawbackMoveInfo(g)).toBe('Must move to a4.');
    expect(legalMoves(g).every(move => move.to === index('a4'))).toBe(true);
    g.board[index('a2')] = { color: 'w', kind: 'n' };
    expect(drawbackMoveInfo(g)).toBeNull();
    expect(legalMoves(g).some(move => move.to !== index('a4'))).toBe(true);
  });
  it('omits redundant turn guidance for Always Check, It Might Be Mate', () => {
    expect(drawbackMoveInfo(newGame('always-check-it-might-be-mate', 'horse', 42))).toBeNull();
  });
  it('shows Must capture for Barbarian Rage only when a capture is required', () => {
    let g = setup('barbarian-rage', { a1: 'wr', a4: 'bp', b4: 'bp' });
    expect(drawbackMoveInfo(g)).toBeNull();
    g = reply(step(g, 'a1', 'a4'));
    expect(drawbackMoveInfo(g)).toBe('Must capture.');
    expect(legalMoves(g).every(move => move.capture !== undefined)).toBe(true);
    g.board[index('b4')] = null;
    expect(drawbackMoveInfo(g)).toBeNull();
    expect(legalMoves(g).some(move => move.capture === undefined)).toBe(true);
    g.board[index('b4')] = { color: 'b', kind: 'p' };
    g.rules!.events.filter(event => event.color === 'w').at(-1)!.capture = undefined;
    expect(drawbackMoveInfo(g)).toBeNull();
  });

  it.each(['w', 'b'] as const)('counts down to the next flooded rank for %s', color => {
    const g = setup('rising-water', {});
    g.turn = color;
    g.drawbacks[color] = 'rising-water';
    for (let completed = 0; completed < 80; completed++) {
      g.turns[color] = completed;
      const remaining = 10 - completed % 10;
      const level = Math.floor(completed / 10);
      const rank = color === 'w' ? level + 1 : 8 - level;
      expect(drawbackMoveInfo(g)).toBe(`${remaining} more ${remaining === 1 ? 'move' : 'moves'} until water rises to rank ${rank}.`);
    }
    g.turns[color] = 80;
    expect(drawbackMoveInfo(g)).toBe('All ranks are underwater.');
    g.result = { winner: color === 'w' ? 'b' : 'w', reason: 'No legal moves' };
    expect(drawbackMoveInfo(g)).toBeNull();
  });

  it.each(['w', 'b'] as const)('shows Bipartisanship direction relative to %s, or nothing after a vertical move', color => {
    const g = setup('bipartisanship', { d4: 'wr' });
    g.turn = color;
    g.drawbacks[color] = 'bipartisanship';
    expect(drawbackMoveInfo(g)).toBeNull();
    const event = { color, from: index('d4'), to: index('c4'), kind: 'r' as const, pieceId: 1 };
    g.rules!.events.push(event);
    expect(drawbackMoveInfo(g)).toBe(color === 'w' ? "Can't move left." : "Can't move right.");
    event.to = index('e5');
    expect(drawbackMoveInfo(g)).toBe(color === 'w' ? "Can't move right." : "Can't move left.");
    event.to = index('d5');
    expect(drawbackMoveInfo(g)).toBeNull();
    g.rules!.events.push({ color: color === 'w' ? 'b' : 'w', from: index('a7'), to: index('b6'), kind: 'p', pieceId: 2 });
    expect(drawbackMoveInfo(g)).toBeNull();
  });

  it('carries capture fatigue with a piece and clears it only after a quiet move', () => {
    let g = setup('battle-fatigue', { a1: 'wr', a4: 'bp', b4: 'bp', a6: 'bp' });
    const identity = g.rules!.pieces[index('a1')].id;
    g = reply(step(g, 'a1', 'a4'));
    expect(g.rules!.pieces[index('a4')].id).toBe(identity);
    expect(has(g, 'a4', 'b4')).toBe(false);
    g = reply(step(g, 'a4', 'a3'));
    expect(has(g, 'a3', 'a6')).toBe(true);
    expect(g.rules!.pieces[index('a3')].fatigued).toBe(false);
  });

  it('absolves a capturing piece only when it starts a turn next to a bishop', () => {
    let g = setup('absolution', { a1: 'wr', a4: 'bp', b4: 'bp', c2: 'wb' });
    g = reply(step(g, 'a1', 'a4'));
    expect(has(g, 'a4', 'b4')).toBe(false);
    g = reply(step(g, 'c2', 'b3'));
    expect(g.rules!.pieces[index('a4')].penitent).toBe(false);
    expect(has(g, 'a4', 'b4')).toBe(true);
  });

  it('unlocks paired pieces at the end of a turn and retains the permission', () => {
    let g = setup('now-kiss', { a1: 'wr', b3: 'wr', a4: 'bp' });
    expect(has(g, 'a1', 'a4')).toBe(false);
    g = reply(step(g, 'b3', 'b2'));
    expect(g.rules!.players.w.kissed).toContain('r');
    expect(has(g, 'a1', 'a4')).toBe(true);
  });

  it('freezes a stationary quicksand piece after consecutive own end-of-turn positions', () => {
    let g = setup('quicksand', { d3: 'wr', a2: 'wp' });
    g = reply(step(g, 'd3', 'd4'));
    expect(has(g, 'd4', 'd3')).toBe(true);
    g = reply(step(g, 'a2', 'a3'));
    expect(g.rules!.pieces[index('d4')].frozen).toBe(true);
    expect(legalMoves(g).some(m => m.from === index('d4'))).toBe(false);
  });

  it('locks each disguised queen to its first movement style', () => {
    let g = setup('queen-disguise', { d1: 'wq' });
    g = reply(step(g, 'd1', 'd3'));
    expect(g.rules!.pieces[index('d3')].queenMode).toBe('r');
    expect(has(g, 'd3', 'e4')).toBe(false);
    expect(has(g, 'd3', 'd4')).toBe(true);
  });

  it('updates the Shapeshifter form on captures and stops confused queens', () => {
    let g = setup('shapeshifter', { d1: 'wq', a1: 'wr', a4: 'bn' });
    expect(has(g, 'd1', 'd3')).toBe(false);
    g = reply(step(g, 'a1', 'a4'));
    expect(g.rules!.players.w.shape).toBe('n');
    expect(legalMoves(g).some(m => m.from === index('d1'))).toBe(false);
  });

  it('allows reconnaissance captures only after one personal turn of study', () => {
    let g = setup('reconnaissance', { a1: 'wr', a4: 'bp', b2: 'wp' });
    expect(has(g, 'a1', 'a4')).toBe(false);
    g = reply(step(g, 'b2', 'b3'));
    expect(g.rules!.players.w.studying).toContain('p');
    expect(has(g, 'a1', 'a4')).toBe(false);
    g = reply(step(g, 'b3', 'b4'));
    expect(g.rules!.players.w.studied).toContain('p');
    expect(has(g, 'a1', 'a4')).toBe(true);
  });

  it('counts checks once per opposing move and ends the game at three', () => {
    let g = setup('three-check', { h7: 'br', a2: 'wp' });
    g = reply(step(g, 'a2', 'a3'));
    expect(g.rules!.players.w.checks).toBe(1);
    g = reply(step(g, 'a3', 'a4'));
    expect(g.rules!.players.w.checks).toBe(2);
    g = reply(step(g, 'a4', 'a5'));
    expect(g.rules!.players.w.checks).toBe(3);
    expect(g.result?.winner).toBe('b');
  });

  it('uses the game-approved root moves even when hiding the opponent rule changes its modeled attacks', () => {
    const g = setup('savior-complex', { d4: 'wk', h1: 'wp', d8: 'bq', a2: 'wp' });
    g.drawbacks.b = 'drag';
    const move = variantMove(g, 1);
    expect(legalMoves(g)).toContainEqual(move);
  });
});
