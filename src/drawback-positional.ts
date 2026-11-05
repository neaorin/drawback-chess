import { other, pseudoMoves, type Game, type Kind, type Move } from './game';
import {
  adjacent, advance, attacked, defended, distance, file, king, rightward, rim, row,
  shade, squares, value,
} from './drawback-helpers';
import type { RuleContext } from './drawback-types';

export const POSITIONAL_IDS = [
  'active-volcano', 'bishop-fan-club', 'blinded-by-the-sun', 'bongcloud',
  'bridge-over-troubled-water', 'champing-at-the-bit', 'cheerleaders', 'chivalry',
  'conscientious-objectors', 'control-center', 'covering-fire', 'crenellations',
  'eat-your-vegetables', 'eisoptrophobia', 'elephants-fear-mice', 'entrenched',
  'exclusivity-clause', 'eye-of-sauron', 'false-prophets', 'far-sighted',
  'femme-fatale', 'forward-march', 'friendly-fire', 'get-down-mr-president',
  'gloomstalker', 'horse-eats-first', 'indecisive', 'inside-the-lines',
  'just-passing-through', 'lame-duck', 'leading-the-charge', 'leaps-and-bounds',
  'left-for-dead', 'lethal-attraction', 'medusa', 'messy-divorce', 'no-shuffling',
  'noblesse-oblige', 'outflanked', 'pack-mentality', 'peons-first', 'power-cells',
  'professional-courtesy', 'protected-pawns', 'punching-down', 'reflective',
  'respectful', 'rook-fan-club', 'royal-berth', 'scouting-ahead', 'secret-garden',
  'separation-anxiety', 'separation-of-church-and-state', 'shadow-queen',
  'sibling-rivalry', 'sleepy-king', 'snipers', 'social-distancing', 'spread-out',
  'stage-fright', 'stand-your-ground', 'stay-at-home-mom', 'stop-stalling',
  'thunderdome', 'torchlight', 'tower-defense', 'trophy-wife', 'true-gentleman',
  'true-love', 'unrequited-love', 'vegan', 'whites-of-their-eyes',
] as const;

const center = (at: number) => row(at) >= 3 && row(at) <= 4 && file(at) >= 3 && file(at) <= 4;
const dome = (at: number) => row(at) >= 2 && row(at) <= 5 && file(at) >= 2 && file(at) <= 5;

export function positionalMoves(ctx: RuleContext): Move[] {
  const { g, color, moves, params } = ctx;
  const enemy = other(color);
  const ownKing = king(g, color);
  const enemyKing = king(g, enemy);
  const kind = (m: Move) => g.board[m.from]!.kind;
  const victim = (m: Move) => m.capture === undefined ? undefined : g.board[m.capture]?.kind;
  const capture = (m: Move) => m.capture !== undefined;
  const filter = (test: (m: Move) => boolean) => moves.filter(test);
  const near = (board: Game, at: number, side = color, type?: Kind) =>
    squares(board, side, type).some(s => adjacent(s, at));
  // Castling relocates two pieces; neither may evade a movement restriction.
  const relocations = (m: Move) => [
    { from: m.from, to: m.to, kind: kind(m) },
    ...(m.castle ? [{ from: m.castle.rookFrom, to: m.castle.rookTo, kind: 'r' as const }] : []),
  ];
  const every = (test: (from: number, to: number, type: Kind, m: Move) => boolean) =>
    filter(m => relocations(m).every(p => test(p.from, p.to, p.kind, m)));
  const geometry = () => pseudoMoves(g, color);
  const furthest = (type: Kind, visible = false) => {
    const origins = squares(g, color, type);
    if (!origins.length) return 7;
    const destinations = visible ? geometry().filter(m => kind(m) === type).map(m => m.to) : [];
    return Math.max(...origins.concat(destinations).map(at => advance(at, color)));
  };
  const royal = (type: Kind | undefined) => type === 'k' || type === 'q';

  switch (g.drawbacks[color] as string | null) {
    case 'active-volcano':
      return every((_from, to) => distance(to, params.square) > 1);
    case 'bishop-fan-club':
      return filter(m => (!m.promotion || m.promotion === 'b') &&
        (!royal(kind(m)) || Math.abs(row(m.to) - row(m.from)) === Math.abs(file(m.to) - file(m.from))));
    case 'blinded-by-the-sun':
      return filter(m => !defended(ctx.after(m), params.square, color));
    case 'bongcloud':
      return every((_from, _to, type) => ownKing === undefined || advance(ownKing, color) !== 0 || type === 'p' || type === 'k');
    case 'bridge-over-troubled-water':
      return every((from, to, type) => {
        if ((row(to) === 3 || row(to) === 4) && file(to) !== 3 && file(to) !== 4) return false;
        const low = Math.min(row(from), row(to)), high = Math.max(row(from), row(to));
        if (low > 4 || high < 3) return true;
        if (type === 'n') return [from, to].every(at => file(at) === 3 || file(at) === 4);
        const dr = Math.sign(row(to) - row(from)), dc = Math.sign(file(to) - file(from));
        if (!dr) return true;
        for (let r = row(from) + dr, f = file(from) + dc; r !== row(to); r += dr, f += dc) {
          if ((r === 3 || r === 4) && f !== 3 && f !== 4) return false;
        }
        return true;
      });
    case 'champing-at-the-bit':
      return filter(m => kind(m) !== 'p' || distance(m.from, m.to) === 2);
    case 'cheerleaders':
      return filter(m => !capture(m) || kind(m) === 'p' || near(g, m.from, color, 'p'));
    case 'chivalry':
      return filter(m => !['r', 'q'].includes(victim(m) ?? '') || kind(m) === 'n');
    case 'conscientious-objectors':
      return filter(m => !capture(m) || kind(m) !== 'p');
    case 'control-center':
      return every((_from, to, _type, m) => capture(m) || (file(to) >= 2 && file(to) <= 5));
    case 'covering-fire': {
      const options = geometry();
      return filter(m => !capture(m) || new Set(options.filter(n => n.capture === m.capture).map(n => n.from)).size >= 2);
    }
    case 'crenellations':
      return filter(m => kind(m) !== 'p' || shade(m.to) === params.color);
    case 'eat-your-vegetables':
      return filter(m => !capture(m) || victim(m) === 'p' || squares(g, enemy, 'p').length <= 4);
    case 'eisoptrophobia':
      return filter(m => !capture(m) || kind(m) !== victim(m));
    case 'elephants-fear-mice':
      return filter(m => victim(m) !== 'p' || kind(m) === 'p');
    case 'entrenched':
      return every((from, to, type) => type !== 'r' || distance(from, to) <= 2);
    case 'exclusivity-clause': {
      const options = geometry();
      return every((_from, to) => new Set(options.filter(m => m.to === to).map(m => m.from)).size <= 1);
    }
    case 'eye-of-sauron': {
      const limit = furthest('r', true);
      return every((_from, to, type) => type === 'p' || advance(to, color) <= limit);
    }
    case 'false-prophets':
      return filter(m => !capture(m) || kind(m) !== 'b');
    case 'far-sighted':
      return filter(m => !capture(m) || !adjacent(m.from, m.capture!));
    case 'femme-fatale':
      return filter(m => victim(m) !== 'k' || kind(m) === 'q');
    case 'forward-march':
      return every((from, to) => advance(to, color) >= advance(from, color));
    case 'friendly-fire':
      return every((_from, to, _type, m) => defended(ctx.after(m), to, color));
    case 'get-down-mr-president':
      return filter(m => kind(m) !== 'k' || ownKing === undefined || !attacked(g, ownKing, enemy));
    case 'gloomstalker':
      return filter(m => !capture(m) || shade(m.from) === 1);
    case 'horse-eats-first':
      return filter(m => !capture(m) || kind(m) === 'n' || squares(g, color, 'n').length === 0);
    case 'indecisive': {
      const options = geometry();
      return filter(m => !capture(m) ||
        new Set(options.filter(n => n.from === m.from && capture(n)).map(n => n.to)).size <= 1);
    }
    case 'inside-the-lines':
      return every((from, to) => !rim(to) || rim(from));
    case 'just-passing-through':
      return filter(m => !capture(m) || 8 - row(m.to) !== params.rank);
    case 'lame-duck':
      return filter(m => kind(m) !== 'k');
    case 'leading-the-charge': {
      const limit = furthest('n');
      return every((_from, to, type) => type === 'n' || advance(to, color) <= limit);
    }
    case 'leaps-and-bounds':
      return every((from, to) => !adjacent(from, to));
    case 'left-for-dead':
      return filter(m => !capture(m) || rightward(m.from, m.to, color) < 0);
    case 'lethal-attraction':
      return every((from, to) => enemyKing === undefined || distance(to, enemyKing) <= distance(from, enemyKing));
    case 'medusa': {
      const petrified = new Set(pseudoMoves(g, enemy)
        .filter(m => g.board[m.from]?.kind === 'q' && capture(m)).map(m => m.capture));
      return every(from => !petrified.has(from));
    }
    case 'messy-divorce':
      return every((from, to) => (file(from) < 4) === (file(to) < 4));
    case 'no-shuffling':
      return every((from, to, type) => type !== 'r' || file(from) === file(to));
    case 'noblesse-oblige':
      return filter(m => !capture(m) || !royal(kind(m)) || royal(victim(m)));
    case 'outflanked':
      return filter(m => !capture(m) || victim(m) === 'k' || !rim(m.capture!));
    case 'pack-mentality':
      return every((_from, to, _type, m) => near(ctx.after(m), to));
    case 'peons-first':
      return every(from => !squares(g, color, 'p').some(at => file(at) === file(from) && advance(at, color) === advance(from, color) + 1));
    case 'power-cells':
      return every((from, to) => distance(from, to) <= squares(g, color, 'p').length);
    case 'professional-courtesy':
      return filter(m => !capture(m) || victim(m) === 'p' || kind(m) !== victim(m));
    case 'protected-pawns':
      return filter(m => kind(m) !== 'p' || defended(ctx.after(m), m.to, color));
    case 'punching-down':
      return filter(m => !capture(m) || victim(m) === 'k' || value[kind(m)] >= value[victim(m)!]);
    case 'reflective':
      return every((_from, to, type, m) => type === 'p' || !!ctx.after(m).board[(7 - row(to)) * 8 + file(to)]);
    case 'respectful':
      return filter(m => {
        const after = ctx.after(m), target = king(after, enemy);
        return target === undefined || !attacked(after, target, color);
      });
    case 'rook-fan-club':
      return filter(m => (!m.promotion || m.promotion === 'r') &&
        (!royal(kind(m)) || row(m.from) === row(m.to) || file(m.from) === file(m.to)));
    case 'royal-berth':
      return every((_from, to, type, m) => type === 'k' || !adjacent(to, king(ctx.after(m), color)));
    case 'scouting-ahead': {
      const limit = furthest('p');
      return every((_from, to, type) => type === 'p' || advance(to, color) <= limit);
    }
    case 'secret-garden':
      return every((_from, to) => to !== params.square);
    case 'separation-anxiety':
      return filter(m => kind(m) !== 'p' || !adjacent(m.from, ownKing) || adjacent(m.to, ownKing));
    case 'separation-of-church-and-state':
      return every((_from, to, type, m) => {
        const after = ctx.after(m);
        if (type === 'b') return !near(after, to, color, 'k') && !near(after, to, enemy, 'k');
        if (type === 'k') return !near(after, to, color, 'b') && !near(after, to, enemy, 'b');
        return true;
      });
    case 'shadow-queen':
      return filter(m => kind(m) !== 'q' || shade(m.to) === 1);
    case 'sibling-rivalry':
      return every((from, to, type, m) => !near(ctx.after(m), to, enemy, from === m.from ? m.promotion ?? type : type));
    case 'sleepy-king':
      return filter(m => kind(m) !== 'k' || (ownKing !== undefined && attacked(g, ownKing, enemy)));
    case 'snipers':
      return filter(m => !capture(m) || kind(m) !== 'b' || distance(m.from, m.to) >= 8);
    case 'social-distancing':
      return every((_from, to, _type, m) => capture(m) || !near(ctx.after(m), to, enemy));
    case 'spread-out':
      return filter(m => {
        if (m.castle) return false;
        if (kind(m) === 'p') return true;
        const after = ctx.after(m);
        return !squares(after, color).some(at => after.board[at]!.kind !== 'p' && adjacent(at, m.to));
      });
    case 'stage-fright':
      return every((_from, to) => !center(to));
    case 'stand-your-ground':
      return filter(m => !capture(m) || attacked(g, m.from, enemy));
    case 'stay-at-home-mom':
      return filter(m => kind(m) !== 'q' || advance(m.to, color) <= 1);
    case 'stop-stalling':
      return every((from, to) => row(from) !== row(to));
    case 'thunderdome': {
      const count = g.board.filter((p, at) => p && dome(at)).length;
      return every((from, to) => !dome(from) || dome(to) || count === 1);
    }
    case 'torchlight':
      return every((from, to, type, m) => type === 'p' || near(g, from, color, 'p') || near(ctx.after(m), to, color, 'p'));
    case 'tower-defense':
      return every((_from, _to, type) => type !== 'r');
    case 'trophy-wife':
      return filter(m => !capture(m) || kind(m) !== 'q');
    case 'true-gentleman':
      return filter(m => victim(m) !== 'q');
    case 'true-love':
      return filter(m => kind(m) !== 'k' && kind(m) !== 'q' ||
        near(ctx.after(m), m.to, color, kind(m) === 'k' ? 'q' : 'k'));
    case 'unrequited-love':
      return filter(m => {
        if (kind(m) !== 'k' && kind(m) !== 'q') return true;
        const targets = squares(g, color, kind(m) === 'k' ? 'q' : 'k');
        if (!targets.length) return kind(m) !== 'k';
        const before = Math.min(...targets.map(at => distance(m.from, at)));
        const after = Math.min(...targets.map(at => distance(m.to, at)));
        return kind(m) === 'k' ? after <= before : after >= before;
      });
    case 'vegan':
      return filter(m => victim(m) !== 'n');
    case 'whites-of-their-eyes':
      return filter(m => !capture(m) || distance(m.from, m.to) <= 2);
    default:
      return moves;
  }
}
