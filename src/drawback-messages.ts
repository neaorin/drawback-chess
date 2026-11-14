import { commandCaptureMoves, other, pseudoMoves, square, uci, type Color, type Game, type Kind, type Move } from './game';
import { adjacent, advance, attacked, distance, file, king, randomNumber, rookSeventhRank, row, secretGardenSquares, shade, squares, value } from './drawback-helpers';
import { positionalMoves } from './drawback-positional';
import { temporalMoves } from './drawback-temporal';
import { randomMoveInfo, ruleContext, rulesFor } from './drawback-state';

export function situationalMessage(g: Game, color: Color, selected: number | null): string | null {
  if (g.result || color !== g.turn) return null;
  const d = g.drawbacks[color];
  const state = rulesFor(g), params = state.params[color], player = state.players[color];
  const own = state.events.filter(e => e.color === color), enemy = state.events.filter(e => e.color !== color);
  const last = own.at(-1), lastEnemy = enemy.at(-1), turn = g.turns[color] + 1;
  const base = pseudoMoves(g);
  const context = ruleContext(g, base);
  const positional = positionalMoves(context);
  const temporal = temporalMoves({ ...context, moves: positional });
  const allowed = new Set(temporal.map(uci));
  const blocked = base.filter(m => !allowed.has(uci(m)));
  const captures = base.filter(m => m.capture !== undefined);
  const captureBlocked = blocked.filter(m => m.capture !== undefined);
  const type = (m: Move) => g.board[m.from]!.kind;
  const victim = (m: Move) => m.capture === undefined ? undefined : g.board[m.capture]?.kind;
  const names: Record<Kind, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  const types = (kinds: Kind[]) => [...new Set(kinds)].map(k => `${names[k]}s`).join(', ');
  const piecesAt = (locations: number[]) => [...new Set(locations)].map(at => `${names[g.board[at]!.kind]} on ${square(at)}`).join(', ');
  const pieces = (moves: Move[]) => piecesAt(moves.map(m => m.from));
  const relocatedOrigins = blocked.flatMap(m => m.castle ? [m.from, m.castle.rookFrom] : [m.from]);
  const cannotCaptureTypes = (moves: Move[], target = false, yet = false) => moves.length
    ? `Cannot capture ${target ? '' : 'with '}${types(moves.map(m => target ? victim(m)! : type(m)))}${yet ? ' yet' : ''}.` : null;
  const cannotMove = () => blocked.length ? `Cannot move ${pieces(blocked)}.` : null;
  const deadline = (at: number, message: (remaining: number) => string, unmet: boolean) =>
    unmet && at - turn + 1 > 0 && at - turn + 1 <= 3 ? message(at - turn + 1) : null;
  const count = (n: number) => `${n} ${n === 1 ? 'move' : 'moves'}`;
  const frontier = (kind: Kind, visible = false) => {
    const locations = squares(g, color, kind);
    if (!locations.length) return null;
    const limit = Math.max(...locations.concat(visible ? base.filter(m => type(m) === kind).map(m => m.to) : [])
      .map(at => advance(at, color)));
    return blocked.length ? `Non-${kind === 'n' ? 'knights' : 'pawns'} cannot advance beyond rank ${color === 'w' ? limit + 1 : 8 - limit}.` : null;
  };
  switch (d) {
    case 'three-check':
      return `Checks left: ${Math.max(0, 3 - player.checks)}.`;
    case 'secret-garden':
      return `Your secret garden is on ${secretGardenSquares(params.square).map(square).join(' and ')}.`;
    case 'alternator':
      return g.lastPawn[color] === null ? null : g.lastPawn[color] ? 'Must move a non-pawn.' : 'Must move a pawn.';
    case 'command': {
      const remaining = commandCaptureMoves(g, color);
      return remaining ? `Can capture for the next ${count(remaining)}.` : captures.length ? 'Cannot capture.' : null;
    }
    case 'even': return captures.length ? (turn % 2 === 0 ? 'Can capture.' : 'Cannot capture.') : null;
    case 'oddball': return turn % 2 === 0 && captures.length ? 'Cannot capture.' : null;
    case 'bipartisanship': return randomMoveInfo(g);
    case 'rising-water': return randomMoveInfo(g);
    case 'glorious-battle': return turn >= params.move && turn < params.move + 4
      ? `Battle! Must capture for the next ${params.move + 4 - turn} moves` : null;
    case 'crusade': return turn >= params.move && turn < params.move + 4
      ? `Must ${squares(g, color).includes(params.square) ? 'keep' : 'occupy'} ${square(params.square)}${squares(g, color).includes(params.square) ? ' occupied' : ''} for the next ${count(params.move + 4 - turn)}.` : null;
    case 'expedition': return turn === params.move ? `Must move to ${square(params.square)}.` : null;
    case 'barbarian-rage': return last?.capture !== undefined && temporal.some(m => m.capture !== undefined) ? 'Must capture.' : null;
    case 'bloodthirsty':
      return turn > 3 && last && last.capture === undefined
        ? own.length >= 2 && own.slice(-2).every(e => e.capture === undefined)
          ? 'Must capture.' : 'Must capture this turn or the next.'
        : null;
    case 'eye-for-an-eye': return lastEnemy?.capture !== undefined ? 'Must capture.' : null;
    case 'checkers': return temporal.some(m => m.capture !== undefined) ? 'Must capture.' : null;
    case 'escort-mission': return temporal.some(m => type(m) === 'k' && m.capture !== undefined) ? 'Must capture with your king.' : null;
    case 'evil-twin': return temporal.some(m => m.capture !== undefined && type(m) === victim(m)) ? 'Must capture a matching piece type.' : null;
    case 'pacman': return temporal.some(m => victim(m) === 'p') ? 'Must capture a pawn.' : null;
    case 'simplifier': return temporal.some(m => m.capture !== undefined && value[type(m)] <= value[victim(m)!])
      ? 'Must capture.' : null;
    case 'ooh-shiny': return temporal.some(m => m.capture !== undefined && !attacked(context.after(m), m.to, other(color)))
      ? 'Must capture.' : null;
    case 'boxing-with-shadows': return lastEnemy && temporal.some(m => m.to === lastEnemy.from) ? `Must move to ${square(lastEnemy.from)}.` : null;
    case 'comfort-zone': return temporal.some(m => m.to === params.square) ? `Must move to ${square(params.square)}.` : null;
    case 'obsession': {
      const at = randomNumber(state.seed, color, g.turns[color], 3) % 64;
      return temporal.some(m => m.to === at) ? `Must move to ${square(at)}.` : null;
    }
    case 'cowardly': return lastEnemy?.capture !== undefined ? 'Must move backwards.' : null;
    case 'bongcloud': return blocked.length ? 'Must move a pawn or king.' : null;
    case 'flatterer': return lastEnemy ? `Must move a ${lastEnemy.kind === 'p' ? 'pawn' : 'non-pawn'}.` : null;
    case 'religious-dispute': return lastEnemy?.kind === 'b' ? 'Must move a bishop.' : null;
    case 'royal-jubilee': return last?.capture !== undefined && last.captured !== 'p' ? 'Must move your king or queen.' : null;
    case 'you-best-not-miss': return last?.gaveCheck ? 'Must capture their king.' : null;
    case 'stir-crazy': return own.length >= 4 && own.slice(-4).every(e => e.kind !== 'k') ? 'Must move your king.' : null;
    case 'savior-complex':
    case 'skittish': {
      const at = king(g, color);
      return at !== undefined && attacked(g, at, other(color)) ? `Must move your ${d === 'savior-complex' ? 'queen' : 'king'}.` : null;
    }
    case 'death-wish': {
      const at = king(g, color);
      return at !== undefined && !attacked(g, at, other(color)) && temporal.some(m => type(m) === 'k' && attacked(context.after(m), m.to, other(color)))
        ? 'Must move your king into attack.' : null;
    }
    case 'jumpy': return temporal.some(m => attacked(g, m.from, other(color))) ? 'Must move an attacked piece.' : null;
    case 'prince-charming': return squares(g, color, 'q').some(at => attacked(g, at, other(color))) && temporal.some(m => type(m) === 'n')
      ? 'Must move a knight.' : null;
    case 'irresistible': {
      const at = king(g, other(color));
      return at !== undefined && temporal.some(m => victim(m) === 'k' || (!adjacent(m.from, at) && adjacent(m.to, at)))
        ? 'Must move beside their king or capture it.' : null;
    }
    case 'guerilla-tactics': return last?.capture !== undefined && temporal.some(m => m.to === last.from && state.pieces[m.from]?.id === last.pieceId)
      ? `Must move ${names[last.kind]} to ${square(last.from)}.` : null;
    case 'relay-race': return last && temporal.some(m => adjacent(m.from, last.to)) ? `Must move a piece beside ${square(last.to)}.` : null;
    case 'torpedos': return last?.kind === 'p' && last.capture === undefined && temporal.some(m => state.pieces[m.from]?.id === last.pieceId)
      ? `Must move the pawn on ${square(last.to)}.` : null;
    case 'absolution':
    case 'battle-fatigue': return captureBlocked.length ? `Cannot capture with ${pieces(captureBlocked)}.` : null;
    case 'medusa': {
      const petrified = new Set(pseudoMoves(g, other(color)).filter(m => g.board[m.from]?.kind === 'q').map(m => m.capture));
      const locations = relocatedOrigins.filter(at => petrified.has(at));
      return locations.length ? `Cannot move ${piecesAt(locations)}.` : null;
    }
    case 'shellshocked': {
      const locations = lastEnemy?.capture === undefined ? [] : relocatedOrigins.filter(at => adjacent(at, lastEnemy.capture!));
      return locations.length ? `Cannot move ${piecesAt(locations)} this turn.` : null;
    }
    case 'fixation': {
      if (!last || !blocked.length) return null;
      const at = squares(g, color).find(at => state.pieces[at]?.id === last.pieceId);
      const opposite = last.kind === 'p' ? 'non-pawn' : 'pawn';
      return at === undefined ? `Must move a ${opposite}.` : `Must move ${names[g.board[at]!.kind]} on ${square(at)} or a ${opposite}.`;
    }
    case 'truant': return cannotMove();
    case 'hipster':
    case 'spice-of-life':
    case 'gambler': return blocked.length ? `Cannot move ${types(blocked.map(type))}.` : null;
    case 'colorblind': return blocked.length ? `Cannot move to ${randomNumber(state.seed, color, g.turns[color], 1) % 2 === 0 ? 'light' : 'dark'} squares.` : null;
    case 'winds-of-fate': return blocked.length ? randomMoveInfo(g)?.replace('This move: cannot move', "Can't move") ?? null : null;
    case 'hopscotch': return last ? `Must move to a ${shade(last.to) === 0 ? 'dark' : 'light'} square.` : null;
    case 'simon-says': return lastEnemy ? `Must move to a ${shade(lastEnemy.to) === 0 ? 'light' : 'dark'} square.` : null;
    case 'cowering-in-fear': return blocked.length ? `Must move a piece worth at least ${Math.max(0, ...enemy.flatMap(e => e.captured ? [value[e.captured]] : []))}.` : null;
    case 'hedonic-treadmill': return lastEnemy && blocked.length ? `Must move a piece worth at least ${value[lastEnemy.kind]}.` : null;
    case 'going-the-distance': return lastEnemy && blocked.length ? `Must move at least distance ${distance(lastEnemy.from, lastEnemy.to)}.` : null;
    case 'left-to-right': return last && file(last.to) !== (color === 'w' ? 7 : 0) ? `Must land to the right of file ${square(last.to)[0]}.` : null;
    case 'diplomatic-immunity':
    case 'turn-the-other-cheek': return captureBlocked.length && lastEnemy ? `Cannot capture on ${square(lastEnemy.to)}.` : null;
    case 'remorseful': return captureBlocked.length ? 'Cannot capture.' : null;
    case 'eat-your-vegetables': return captureBlocked.length ? 'Can only capture pawns.' : null;
    case 'horse-eats-first': return captureBlocked.length ? 'Can only capture with knights.' : null;
    case 'theocracy': return turn % 2 === params.parity ? 'Can only capture with bishops.' : null;
    case 'leveling-up': return cannotCaptureTypes(captureBlocked, true, true);
    case 'monkey-see':
      const capturable = enemy.filter(e => e.capture !== undefined).map(e => e.kind);
      return capturable.length ? `Can capture with ${types(capturable) || 'none'}.` : 'Cannot capture.';
    case 'reconnaissance':
      return `Can capture ${types(player.studied) || 'none'}, researching ${types(player.studying.filter(kind => !player.studied.includes(kind))) || 'none'}.`;
    case 'velociraptor':
      return `Can capture ${types(enemy.slice(-3).map(e => e.kind)) || 'none'}.`;
    case 'now-kiss': return cannotCaptureTypes(captures.filter(m => ['b', 'n', 'r'].includes(type(m)) && !player.kissed.includes(type(m))));
    case 'nurturer':
    case 'triple-play': return captureBlocked.some(m => victim(m) === 'k') ? 'Cannot capture their king yet.' : null;
    case 'get-down-mr-president':
    case 'ladies-first':
    case 'sleepy-king':
    case 'out-of-breath': return blocked.some(m => type(m) === 'k') ? 'Cannot move your king.' : null;
    case 'queen-bee': return blocked.length ? 'Cannot move queens.' : null;
    case 'queen-disguise': {
      const mode = selected === null ? undefined : state.pieces[selected]?.queenMode;
      return selected !== null && g.board[selected]?.kind === 'q' && mode ? `Queen moves like a ${mode === 'r' ? 'rook' : 'bishop'}.` : null;
    }
    case 'shapeshifter': {
      if (!squares(g, color, 'q').length || !(selected !== null && g.board[selected]?.kind === 'q' || last?.captured && last.captured !== 'p')) return null;
      return player.shape === 'n' ? 'Cannot move queens.' : `Queen moves like a ${names[player.shape]}.`;
    }
    case 'the-scent-of-blood': return selected !== null && positional.some(m => m.from === selected && m.capture !== undefined) &&
      blocked.some(m => m.from === selected && m.capture === undefined) ? 'This piece must capture if moved.' : null;
    case 'eye-of-sauron': return frontier('r', true);
    case 'leading-the-charge': return frontier('n');
    case 'scouting-ahead': return frontier('p');
    case 'power-cells': return blocked.length ? `Maximum move distance: ${squares(g, color, 'p').length}.` : null;
    case 'doctor-octopus': {
      const remaining = Math.max(0, 8 - own.filter(e => e.capture !== undefined && e.captured !== 'k').length);
      return remaining === 0 ? captureBlocked.length ? 'Cannot capture non-kings.' : null : remaining <= 3 ? `${remaining} non-king captures remaining.` : null;
    }
    case 'unspooling': {
      const remaining = 100 - own.reduce((sum, e) => sum + distance(e.from, e.to), 0);
      return `Distance left: ${remaining}.`;
    }
    case 'ichthyophobe': {
      const ban = state.engineBans[g.turns.w + g.turns.b];
      return ban ? `Cannot play ${ban.slice(0, 2)}–${ban.slice(2, 4)}${ban.slice(4)}.` : 'Preparing forbidden move…';
    }
    case 'windup-toys': return !squares(g, color).some(at => ['b', 'n'].includes(g.board[at]!.kind)) ? null :
      turn > 12 ? blocked.length ? 'Cannot move knights or bishops.' : null :
      deadline(12, n => `Only ${count(n)} until the toys wind down`, true);
    case 'botez-gambit': {
      const unmetOwn = squares(g, color, 'q').length > 0, unmetEnemy = !squares(g, other(color), 'q').length;
      return deadline(10, n => [unmetOwn ? `${count(n)} left to remove your queen.` : '', unmetEnemy ? 'Their queen must remain for turn 11.' : ''].filter(Boolean).join(' '), unmetOwn || unmetEnemy);
    }
    case 'fischer-random': return deadline(20, n => `${count(n)} left to rearrange your non-pawns.`, !player.achieved.includes('fischer-random'));
    case 'siege': return deadline(20, n => `${count(n)} left to capture an enemy rook.`, !own.some(e => e.captured === 'r'));
    case 'rook-on-the-seventh': return deadline(15, n => `${count(n)} left to move a rook to rank ${rookSeventhRank(color)}.`, !own.some(e => e.kind === 'r' && 8 - row(e.to) === rookSeventhRank(color)));
    case 'moving-day': return turn <= 20 ? deadline(20, n => `${count(n)} left to clear your home rank.`, squares(g, color).some(at => advance(at, color) === 0)) :
      base.some(m => advance(m.to, color) === 0) ? 'Must keep your home rank clear.' : null;
    case 'warlord': {
      const at = king(g, color), ranks = color === 'w' ? '1–2' : '7–8';
      return turn <= 11 ? deadline(11, n => `${count(n)} left to move your king beyond ranks ${ranks}.`, at !== undefined && advance(at, color) < 2) :
        base.some(m => type(m) === 'k' && advance(m.to, color) < 2) ? `King must stay beyond ranks ${ranks}.` : null;
    }
    case 'inching-forward': {
      const boundary = (Math.floor(g.turns[color] / 6) + 1) * 6;
      const level = Math.min(7, boundary / 6), at = king(g, color);
      return deadline(boundary, n => `${count(n)} until your king must reach rank ${color === 'w' ? level + 1 : 8 - level}.`, at !== undefined && advance(at, color) < level);
    }
    case 'king-of-the-hill': {
      const center = [27, 28, 35, 36];
      return !squares(g, color).some(at => center.includes(at)) ? 'Must occupy a center square.' :
        base.some(m => !squares(context.after(m), color).some(at => center.includes(at))) ? 'Must keep a piece in the center.' : null;
    }
    default: return null;
  }
}
