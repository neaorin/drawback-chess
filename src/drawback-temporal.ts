import { other, type Kind, type Move } from './game';
import { adjacent, advance, attacked, distance, file, king, preferredCapture, randomNumber, rightward, row, shade, squares, unluckySquares, value } from './drawback-helpers';
import type { RuleContext, RuleEvent } from './drawback-types';

export const TEMPORAL_IDS = [
  'absolution', 'barbarian-rage', 'battle-fatigue', 'bipartisanship', 'bloodthirsty',
  'boxing-with-shadows', 'checkers', 'colorblind', 'comfort-zone', 'cowardly',
  'cowering-in-fear', 'crossing-the-rubicon', 'death-wish', 'diplomatic-immunity',
  'doctor-octopus', 'escort-mission', 'evil-twin', 'expedition', 'eye-for-an-eye',
  'fixation', 'flatterer', 'gambler', 'glorious-battle', 'going-the-distance',
  'guerilla-tactics', 'haunted', 'hedonic-treadmill', 'hipster', 'hopscotch',
  'irresistible', 'jumpy', 'ladies-first', 'left-to-right', 'leveling-up',
  'monkey-see', 'nurturer', 'obsession', 'oddball', 'ooh-shiny', 'out-of-breath',
  'pacman', 'prince-charming', 'queen-bee', 'queen-disguise', 'quicksand',
  'reconnaissance', 'relay-race', 'religious-dispute', 'remorseful', 'rising-water',
  'royal-jubilee', 'savior-complex', 'scorched-earth', 'shellshocked', 'simon-says',
  'simplifier', 'skittish', 'spice-of-life', 'stir-crazy', 'superstitious',
  'the-scent-of-blood', 'theocracy', 'torpedos', 'triple-play', 'truant',
  'turn-the-other-cheek', 'unlucky', 'unspooling', 'velociraptor', 'winds-of-fate',
  'windup-toys', 'you-best-not-miss',
] as const;

// Stable salts keep the random restrictions reproducible throughout a personal turn.
export const TEMPORAL_SALTS = { colorblind: 1, gambler: 2, obsession: 3, winds: 4, unlucky: 100 } as const;
const kinds: Kind[] = ['p', 'n', 'b', 'r', 'q', 'k'];
const captured = (event: RuleEvent | undefined) => event?.capture !== undefined;

export function temporalMoves(ctx: RuleContext): Move[] {
  const { g, color, moves, state, params, own, enemy, last, lastEnemy } = ctx;
  const opponent = other(color), turn = g.turns[color] + 1;
  const kind = (m: Move) => g.board[m.from]!.kind;
  const victim = (m: Move) => m.capture === undefined ? undefined : g.board[m.capture]?.kind;
  const capture = (m: Move) => m.capture !== undefined;
  const id = (m: Move) => state.pieces[m.from]?.id;
  const samePiece = (m: Move, event: RuleEvent) => id(m) === event.pieceId;
  const filter = (test: (m: Move) => boolean) => moves.filter(test);
  const prefer = (test: (m: Move) => boolean) => {
    const preferred = filter(test);
    return preferred.length ? preferred : moves;
  };
  const random = (salt: number) => randomNumber(state.seed, color, g.turns[color], salt);
  const inCheck = () => {
    const at = king(g, color);
    return at !== undefined && attacked(g, at, opponent);
  };
  const relocations = (m: Move) => m.castle
    ? [{ from: m.from, to: m.to }, { from: m.castle.rookFrom, to: m.castle.rookTo }]
    : [m];

  switch (g.drawbacks[color] as string | null) {
    case 'absolution':
      return filter(m => !capture(m) || kind(m) === 'b' || !state.pieces[m.from]?.penitent);
    case 'barbarian-rage':
      return captured(last) ? prefer(capture) : moves;
    case 'battle-fatigue':
      return filter(m => !capture(m) || !state.pieces[m.from]?.fatigued);
    case 'bipartisanship':
      return last ? filter(m => rightward(last.from, last.to, color) * rightward(m.from, m.to, color) <= 0) : moves;
    case 'bloodthirsty':
      return turn > 3 && own.length >= 2 && own.slice(-2).every(e => !captured(e)) ? filter(capture) : moves;
    case 'boxing-with-shadows':
      return lastEnemy ? prefer(m => m.to === lastEnemy.from) : moves;
    case 'checkers':
      return prefer(capture);
    case 'colorblind':
      return filter(m => relocations(m).every(r => shade(r.to) !== random(TEMPORAL_SALTS.colorblind) % 2));
    case 'comfort-zone':
      return prefer(m => m.to === params.square);
    case 'cowardly':
      return captured(lastEnemy) ? filter(m => advance(m.to, color) < advance(m.from, color)) : moves;
    case 'cowering-in-fear': {
      const minimum = Math.max(0, ...enemy.flatMap(e => e.captured ? [value[e.captured]] : []));
      return filter(m => value[kind(m)] >= minimum);
    }
    case 'crossing-the-rubicon':
      return filter(m => relocations(m).every(r => advance(r.to, color) >= 4 ||
        (advance(r.from, color) < 4 && !own.some(e =>
          e.pieceId === state.pieces[r.from]?.id && advance(e.to, color) >= 4))));
    case 'death-wish':
      return inCheck() ? moves : prefer(m => {
        if (kind(m) !== 'k') return false;
        const next = ctx.after(m);
        return attacked(next, m.to, opponent);
      });
    case 'diplomatic-immunity':
      return lastEnemy && !captured(lastEnemy) ? filter(m => m.capture !== lastEnemy.to) : moves;
    case 'doctor-octopus':
      return own.filter(e => captured(e) && e.captured !== 'k').length >= 8
        ? filter(m => !capture(m) || victim(m) === 'k') : moves;
    case 'escort-mission':
      return prefer(m => preferredCapture(g, m));
    case 'evil-twin':
      return prefer(m => preferredCapture(g, m));
    case 'expedition':
      return turn === params.move ? filter(m => m.to === params.square) : moves;
    case 'eye-for-an-eye':
      return captured(lastEnemy) ? filter(capture) : moves;
    case 'fixation':
      return last ? filter(m => (kind(m) === 'p') !== (last.kind === 'p') || samePiece(m, last)) : moves;
    case 'flatterer':
      return lastEnemy ? filter(m => (kind(m) === 'p') === (lastEnemy.kind === 'p')) : moves;
    case 'gambler': {
      const banned = kinds[random(TEMPORAL_SALTS.gambler) % kinds.length];
      return filter(m => kind(m) !== banned);
    }
    case 'glorious-battle':
      return turn >= params.move && turn < params.move + 4 ? filter(capture) : moves;
    case 'going-the-distance':
      return lastEnemy ? filter(m => distance(m.from, m.to) >= distance(lastEnemy.from, lastEnemy.to)) : moves;
    case 'guerilla-tactics':
      return last && captured(last) ? prefer(m => samePiece(m, last) && m.to === last.from) : moves;
    case 'haunted': {
      const forbidden = new Set(own.filter(captured).map(e => e.to));
      return filter(m => relocations(m).every(r => !forbidden.has(r.to)));
    }
    case 'hedonic-treadmill':
      return lastEnemy ? filter(m => value[kind(m)] >= value[lastEnemy.kind]) : moves;
    case 'hipster':
      return lastEnemy ? filter(m => kind(m) !== lastEnemy.kind) : moves;
    case 'hopscotch':
      return last ? filter(m => shade(m.to) !== shade(last.to)) : moves;
    case 'irresistible': {
      const target = king(g, opponent);
      return target === undefined ? moves : prefer(m => victim(m) === 'k' ||
        (!adjacent(m.from, target) && adjacent(m.to, target)));
    }
    case 'jumpy':
      return prefer(m => attacked(g, m.from, opponent));
    case 'ladies-first':
      return filter(m => kind(m) !== 'k' || last?.kind === 'q');
    case 'left-to-right':
      return !last || file(last.to) === (color === 'w' ? 7 : 0)
        ? moves : filter(m => rightward(last.to, m.to, color) > 0);
    case 'leveling-up':
      return filter(m => {
        const target = victim(m);
        if (!target || target === 'p') return true;
        return own.some(e => e.captured === kinds[kinds.indexOf(target) - 1]);
      });
    case 'monkey-see':
      return filter(m => !capture(m) || enemy.some(e => captured(e) && e.kind === kind(m)));
    case 'nurturer':
      return filter(m => victim(m) !== 'k' || own.some(e => e.promotion !== undefined));
    case 'obsession':
      return prefer(m => m.to === random(TEMPORAL_SALTS.obsession) % 64);
    case 'oddball':
      return turn % 2 === 1 ? moves : filter(m => !capture(m));
    case 'ooh-shiny':
      return prefer(m => preferredCapture(g, m));
    case 'out-of-breath':
      return own.some(e => e.kind === 'k') ? filter(m => kind(m) !== 'k') : moves;
    case 'pacman':
      return prefer(m => victim(m) === 'p');
    case 'prince-charming':
      return squares(g, color, 'q').some(at => attacked(g, at, opponent)) ? prefer(m => kind(m) === 'n') : moves;
    case 'queen-bee':
      return own.some(e => e.kind === 'q' && captured(e)) ? filter(m => kind(m) !== 'q') : moves;
    case 'queen-disguise':
      return filter(m => {
        if (kind(m) !== 'q') return true;
        const mode = state.pieces[m.from]?.queenMode;
        return !mode || (mode === 'r'
          ? row(m.from) === row(m.to) || file(m.from) === file(m.to)
          : Math.abs(row(m.from) - row(m.to)) === Math.abs(file(m.from) - file(m.to)));
      });
    case 'quicksand':
      return filter(m => relocations(m).every(r => !state.pieces[r.from]?.frozen));
    case 'reconnaissance':
      return filter(m => !capture(m) || state.players[color].studied.includes(victim(m)!));
    case 'relay-race':
      return last ? prefer(m => adjacent(m.from, last.to)) : moves;
    case 'religious-dispute':
      return lastEnemy?.kind === 'b' ? filter(m => kind(m) === 'b') : moves;
    case 'remorseful':
      return captured(last) ? filter(m => !capture(m)) : moves;
    case 'rising-water': {
      const level = Math.floor(g.turns[color] / 10);
      return filter(m => relocations(m).every(r => advance(r.from, color) >= level && advance(r.to, color) >= level));
    }
    case 'royal-jubilee':
      return captured(last) && last?.captured !== 'p' ? filter(m => kind(m) === 'k' || kind(m) === 'q') : moves;
    case 'savior-complex':
      return inCheck() ? filter(m => kind(m) === 'q') : moves;
    case 'scorched-earth': {
      const forbidden = new Set(own.flatMap(e => e.castle ? [e.from, e.castle.rookFrom] : [e.from]));
      return filter(m => relocations(m).every(r => !forbidden.has(r.to)));
    }
    case 'shellshocked':
      return captured(lastEnemy) ? filter(m => relocations(m).every(r => !adjacent(r.from, lastEnemy!.capture!))) : moves;
    case 'simon-says':
      return lastEnemy ? filter(m => shade(m.to) === shade(lastEnemy.to)) : moves;
    case 'simplifier':
      return prefer(m => preferredCapture(g, m));
    case 'skittish':
      return inCheck() ? filter(m => kind(m) === 'k') : moves;
    case 'spice-of-life':
      return last ? filter(m => kind(m) !== last.kind) : moves;
    case 'stir-crazy':
      return own.length >= 4 && own.slice(-4).every(e => e.kind !== 'k') ? filter(m => kind(m) === 'k') : moves;
    case 'superstitious': {
      const forbidden = new Set(enemy.filter(captured).map(e => e.to));
      return filter(m => relocations(m).every(r => !forbidden.has(r.to)));
    }
    case 'the-scent-of-blood': {
      const hungry = new Set(moves.filter(capture).map(m => m.from));
      return filter(m => capture(m) || !hungry.has(m.from));
    }
    case 'theocracy':
      return turn % 2 === params.parity ? filter(m => !capture(m) || kind(m) === 'b') : moves;
    case 'torpedos':
      return last?.kind === 'p' && !captured(last) ? prefer(m => samePiece(m, last)) : moves;
    case 'triple-play':
      return filter(m => victim(m) !== 'k' || squares(g, color, params.piece).length >= 3);
    case 'truant':
      return last ? filter(m => !samePiece(m, last)) : moves;
    case 'turn-the-other-cheek':
      return captured(lastEnemy) ? filter(m => m.capture !== lastEnemy!.to) : moves;
    case 'unlucky': {
      const forbidden = unluckySquares(state.seed, color, g.turns[color]);
      return filter(m => relocations(m).every(r => !forbidden.has(r.to)));
    }
    case 'unspooling': {
      const spent = own.reduce((sum, e) => sum + distance(e.from, e.to), 0);
      return filter(m => spent + distance(m.from, m.to) <= 100);
    }
    case 'velociraptor':
      return filter(m => !capture(m) || enemy.slice(-3).some(e => e.kind === victim(m)));
    case 'winds-of-fate': {
      const banned = random(TEMPORAL_SALTS.winds) % 2 === 0 ? -1 : 1;
      return filter(m => Math.sign(rightward(m.from, m.to, color)) !== banned);
    }
    case 'windup-toys':
      return turn > 12 ? filter(m => relocations(m).every(r => !['n', 'b'].includes(g.board[r.from]!.kind))) : moves;
    case 'you-best-not-miss':
      return last?.gaveCheck ? filter(m => victim(m) === 'k') : moves;
    default:
      return moves;
  }
}
