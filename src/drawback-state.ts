import { pseudoMoves, other, type Color, type Game, type Kind, type Move } from './game';
import { adjacent, attacked, distance, file, king, preview, randomNumber, rightward, row, squares } from './drawback-helpers';
import type { PlayerMemory, RuleContext, RuleParameters, RuleState } from './drawback-types';

const playerMemory = (): PlayerMemory => ({
  checks: 0, kissed: [], studied: [], studying: [], central: [], shape: 'b', achieved: [],
});

export function initialRules(g: Game, seed: number): RuleState {
  const params = (color: Color): RuleParameters => {
    const random = (salt: number) => randomNumber(seed, color, 0, salt);
    let square = 16 + random(11) % 32;
    if (g.drawbacks[color] === 'blinded-by-the-sun') {
      square = [27, 28, 35, 36][random(11) % 4];
    }
    if (g.drawbacks[color] === 'active-volcano') {
      square = [26, 27, 28, 29, 34, 35, 36, 37][random(11) % 8];
    }
    if (g.drawbacks[color] === 'secret-garden') square = (color === 'w' ? 40 : 16) + random(11) % 8;
    if (g.drawbacks[color] === 'crusade') square = [27, 28, 35, 36][random(11) % 4];
    return {
      square, move: 6 + random(12) % 7, color: random(13) % 2, rank: 3 + random(14) % 4,
      parity: random(15) % 2, piece: (['n', 'b', 'r'] as const)[random(16) % 3],
    };
  };
  return {
    seed, params: { w: params('w'), b: params('b') },
    pieces: Object.fromEntries(g.board.flatMap((p, at) => p ? [[at, { id: at }]] : [])),
    players: { w: playerMemory(), b: playerMemory() }, events: [], engineBans: {},
  };
}

export function rulesFor(g: Game): RuleState {
  return g.rules ?? initialRules(g, 1);
}

export function ruleContext(g: Game, moves = pseudoMoves(g)): RuleContext {
  const state = rulesFor(g), color = g.turn;
  const own = state.events.filter(e => e.color === color);
  const enemy = state.events.filter(e => e.color !== color);
  return {
    g, color, moves, state, params: state.params[color], own, enemy,
    last: own.at(-1), lastEnemy: enemy.at(-1), after: m => preview(g, m),
  };
}

export function needsEngineBan(g: Game): boolean {
  return !g.result && g.drawbacks[g.turn] === 'ichthyophobe' &&
    rulesFor(g).engineBans[g.turns.w + g.turns.b] === undefined;
}

export function updateRules(g: Game, next: Game, m: Move): RuleState {
  const old = rulesFor(g), color = g.turn, opponent = other(color), piece = g.board[m.from]!;
  const captured = m.capture === undefined ? null : g.board[m.capture];
  const pieces = { ...old.pieces };
  const memory = { ...(pieces[m.from] ?? { id: m.from }) };
  delete pieces[m.from];
  if (m.capture !== undefined) delete pieces[m.capture];
  memory.fatigued = m.capture !== undefined;
  if (m.capture !== undefined && piece.kind !== 'b') memory.penitent = true;
  if (piece.kind === 'q' && !memory.queenMode) {
    memory.queenMode = row(m.from) !== row(m.to) && file(m.from) !== file(m.to) ? 'b' : 'r';
  }
  pieces[m.to] = memory;
  if (m.castle) {
    pieces[m.castle.rookTo] = { ...(pieces[m.castle.rookFrom] ?? { id: m.castle.rookFrom }) };
    delete pieces[m.castle.rookFrom];
  }
  const players = {
    w: { ...old.players.w }, b: { ...old.players.b },
  };
  const current = players[color], incoming = players[opponent];
  for (const kind of ['b', 'n', 'r'] as const) {
    const locations = squares(next, color, kind);
    if (locations.some((a, i) => locations.some((b, j) => i !== j && adjacent(a, b)))) {
      current.kissed = [...new Set([...current.kissed, kind])];
    }
  }
  if (captured && captured.kind !== 'p') current.shape = captured.kind;
  const central = squares(next, color).filter(at => row(at) === 3 || row(at) === 4);
  if (g.drawbacks[color] === 'quicksand') {
    for (const at of central) {
      if (current.central.includes(at) && at !== m.to) pieces[at] = { ...pieces[at], frozen: true };
    }
  }
  current.central = central;
  if (g.drawbacks[color] === 'fischer-random' && next.turns[color] <= 20 &&
      squares(next, color).filter(at => next.board[at]!.kind !== 'p').every(at => {
        const kind = next.board[at]!.kind;
        const startingFiles: Record<Kind, number[]> = { r: [0, 7], n: [1, 6], b: [2, 5], q: [3], k: [4], p: [] };
        return row(at) === (color === 'w' ? 7 : 0) && !startingFiles[kind].includes(file(at));
      })) current.achieved = [...new Set([...current.achieved, 'fischer-random'])];
  const ownKing = king(next, opponent);
  const gaveCheck = ownKing !== undefined && attacked(next, ownKing, color);
  if (gaveCheck) incoming.checks++;
  if (g.drawbacks[opponent] === 'absolution') {
    const bishops = squares(next, opponent, 'b');
    for (const at of squares(next, opponent)) {
      if (bishops.some(b => adjacent(at, b))) pieces[at] = { ...(pieces[at] ?? { id: at }), penitent: false };
    }
  }
  if (g.drawbacks[opponent] === 'reconnaissance') {
    incoming.studied = [...new Set([...incoming.studied, ...incoming.studying])];
    incoming.studying = [...new Set(pseudoMoves(next, opponent).flatMap(move =>
      move.capture === undefined || !next.board[move.capture] ? [] : [next.board[move.capture]!.kind]))];
  }
  return {
    ...old, pieces, players,
    events: [...old.events, {
      color, kind: piece.kind, pieceId: memory.id, from: m.from, to: m.to,
      capture: m.capture, captured: captured?.kind, promotion: m.promotion, castle: m.castle, gaveCheck,
    }],
  };
}

export function movementKind(g: Game, at: number): Kind | null {
  const piece = g.board[at];
  if (!piece) return null;
  if (piece.kind !== 'q') return piece.kind;
  if (g.drawbacks[piece.color] === 'drag') return 'k';
  if (g.drawbacks[piece.color] === 'shapeshifter') {
    const shape = rulesFor(g).players[piece.color].shape;
    return shape === 'n' ? null : shape;
  }
  return piece.kind;
}

export function parameterDescription(g: Game, color: Color, description: string): string {
  const p = rulesFor(g).params[color];
  const sq = 'abcdefgh'[file(p.square)] + (8 - row(p.square));
  const words: Record<string, string> = {
    SQUARE: sq, CALDERA: sq, SUN: sq, HOLY_LAND: sq,
    MOVE: String(p.move), COLOR: p.color === 0 ? 'light' : 'dark',
    RANK: String(p.rank), PARITY: p.parity === 0 ? 'even' : 'odd',
    PIECE: { n: 'knight', b: 'bishop', r: 'rook' }[p.piece],
  };
  return description.replace(/\$([A-Z_]+)/g, (match, key: string) => words[key] ?? match);
}

export function templateDescription(description: string): string {
  const words: Record<string, string> = {
    SQUARE: 'a random square', CALDERA: 'a random volcanic square', SUN: 'a random sun square',
    HOLY_LAND: 'a random central square', MOVE: 'N (assigned at game start)',
    COLOR: 'a randomly chosen color of',
  };
  return description
    .replace(/\$RANK rank/g, 'randomly assigned rank')
    .replace(/\$PARITY-numbered/g, 'randomly selected odd- or even-numbered')
    .replace(/three \$PIECEs/g, 'three of an assigned piece type (knights, bishops, or rooks)')
    .replace(/\$([A-Z_]+)/g, (match, key: string) => words[key] ?? match);
}

export function randomMoveInfo(g: Game): string | null {
  const s = rulesFor(g), c = g.turn, turn = g.turns[c];
  const own = s.events.filter(e => e.color === c);
  const pieceNames: Record<Kind, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  switch (g.drawbacks[c]) {
    case 'rising-water': {
      const level = Math.floor(turn / 10);
      if (level >= 8) return 'All ranks are underwater.';
      const remaining = 10 - turn % 10;
      const rank = c === 'w' ? level + 1 : 8 - level;
      return `${remaining} more ${remaining === 1 ? 'move' : 'moves'} until water rises to rank ${rank}.`;
    }
    case 'bipartisanship': {
      const last = own.at(-1);
      const direction = last ? rightward(last.from, last.to, c) : 0;
      return direction < 0 ? "Can't move left." : direction > 0 ? "Can't move right." : null;
    }
    case 'colorblind': return `This move: cannot land on ${randomNumber(s.seed, c, turn, 1) % 2 === 0 ? 'light' : 'dark'} squares.`;
    case 'gambler': return `This move: cannot move ${['pawns', 'knights', 'bishops', 'rooks', 'queens', 'kings'][randomNumber(s.seed, c, turn, 2) % 6]}.`;
    case 'obsession': {
      const at = randomNumber(s.seed, c, turn, 3) % 64;
      return `Must move to ${'abcdefgh'[file(at)]}${8 - row(at)} if possible.`;
    }
    case 'winds-of-fate': return `This move: cannot move ${randomNumber(s.seed, c, turn, 4) % 2 === 0 ? 'left' : 'right'}.`;
    case 'unlucky': return 'Half of the destination squares are forbidden this turn. Select a piece to see its legal moves.';
    case 'unspooling':
      return `Distance remaining: ${100 - own.reduce((sum, e) => sum + distance(e.from, e.to), 0)}. Using the last unit loses the game.`;
    case 'doctor-octopus':
      return `Non-king captures remaining: ${Math.max(0, 8 - own.filter(e => e.captured && e.captured !== 'k').length)}.`;
    case 'three-check': return `Checks received: ${s.players[c].checks} / 3. The third loses the game.`;
    case 'octomom':
      return `Pieces lost: ${s.events.filter(e => e.color !== c && e.capture !== undefined).length} / 8. Losing the eighth loses the game.`;
    case 'now-kiss':
      return `Capture-ready pairs: ${s.players[c].kissed.map(k => `${pieceNames[k]}s`).join(', ') || 'none'}. End a turn with matching bishops, knights, or rooks adjacent to unlock that type.`;
    case 'reconnaissance':
      return `Studied types you can capture: ${s.players[c].studied.map(k => pieceNames[k]).join(', ') || 'none yet'}. Newly observed types become capturable next turn.`;
    case 'shapeshifter':
      return s.players[c].shape === 'n' ? 'Your queen is confused and cannot move.' :
        `Your queen currently moves like a ${pieceNames[s.players[c].shape]}.`;
    case 'ichthyophobe': {
      const ban = s.engineBans[g.turns.w + g.turns.b];
      return ban ? `Engine-selected forbidden move: ${ban}. All other legal moves remain available.` :
        'Preparing the engine-selected forbidden move. Please wait.';
    }
    default: return null;
  }
}
