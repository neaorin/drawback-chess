import { other, type Color, type Game } from './game';
import { adjacent, advance, attacked, defended, distance, file, king, rim, rookSeventhRank, row, secretGardenSquares, squares } from './drawback-helpers';
import { rulesFor } from './drawback-state';

export const LOSS_IDS = [
  'abstinence', 'always-check-it-might-be-mate', 'atomic-bomb', 'boastful', 'body-snatcher',
  'botez-gambit', 'castle', 'closed-book', 'crusade', 'drag', 'edgelord', 'fischer-random',
  'hold-them-back', 'homeland-security', 'inching-forward', 'ivory-tower', 'king-of-the-hill',
  'modest', 'moving-day', 'my-kingdom-for-a-horse', 'octomom', 'paranoid', 'pawn-battle',
  'rook-on-the-seventh', 'secret-garden', 'siege', 'simp', 'three-check', 'tower-defense', 'warlord', 'unspooling',
] as const;

export function drawbackLoss(g: Game, color: Color): string | null {
  const d = g.drawbacks[color], enemy = other(color), state = rulesFor(g);
  const own = squares(g, color), theirs = squares(g, enemy);
  const ownEvents = state.events.filter(e => e.color === color);
  const enemyEvents = state.events.filter(e => e.color === enemy);
  const last = state.events.at(-1), at = king(g, color);
  const incoming = g.turn === color, completed = g.turns[color];
  const afterOwn = last?.color === color;
  const p = state.params[color];
  let lost = false;
  switch (d) {
    case 'abstinence':
      lost = theirs.some(a => g.board[a]!.kind !== 'p' && theirs.some(b =>
        adjacent(a, b) && g.board[a]!.kind === g.board[b]!.kind)); break;
    case 'always-check-it-might-be-mate': lost = at !== undefined && attacked(g, at, enemy); break;
    case 'atomic-bomb':
      lost = last?.color === enemy && last.capture !== undefined && at !== undefined && adjacent(last.capture, at); break;
    case 'boastful': lost = own.length < theirs.length; break;
    case 'body-snatcher':
      lost = last?.color === enemy && last.captured !== undefined && last.captured !== 'p' && last.captured === last.kind; break;
    case 'botez-gambit':
      lost = incoming && completed === 10 && (squares(g, color, 'q').length !== 0 || squares(g, enemy, 'q').length === 0); break;
    case 'castle': lost = last?.color === enemy && last.captured === 'r'; break;
    case 'closed-book':
      lost = incoming && Array.from({ length: 8 }, (_, f) => f).some(f =>
        !g.board.some((piece, i) => piece?.kind === 'p' && file(i) === f)); break;
    case 'crusade':
      lost = afterOwn && completed >= p.move && completed < p.move + 4 && !own.includes(p.square); break;
    case 'drag': lost = last?.color === enemy && last.captured === 'q'; break;
    case 'edgelord': lost = own.filter(rim).length < theirs.filter(rim).length; break;
    case 'fischer-random':
      lost = completed >= 20 && !state.players[color].achieved.includes('fischer-random'); break;
    case 'hold-them-back':
      lost = last?.color === enemy && last.kind === 'p' && advance(last.to, color) < 4; break;
    case 'homeland-security':
      lost = last?.color === enemy && advance(last.to, color) < 2; break;
    case 'inching-forward':
      lost = completed >= 6 && at !== undefined && advance(at, color) < Math.min(7, Math.floor(completed / 6)); break;
    case 'ivory-tower': lost = at !== undefined && theirs.some(b => adjacent(at, b)); break;
    case 'king-of-the-hill':
      lost = incoming && completed >= 1 && !own.some(a => [27, 28, 35, 36].includes(a)); break;
    case 'modest': lost = own.length > theirs.length; break;
    case 'moving-day':
      lost = incoming && completed >= 20 && own.some(a => advance(a, color) === 0); break;
    case 'my-kingdom-for-a-horse': lost = last?.color === enemy && last.captured === 'n'; break;
    case 'octomom': lost = enemyEvents.filter(e => e.capture !== undefined).length >= 8; break;
    case 'paranoid': lost = at !== undefined && !defended(g, at, color); break;
    case 'pawn-battle': lost = squares(g, color, 'p').length < squares(g, enemy, 'p').length; break;
    case 'rook-on-the-seventh':
      lost = completed >= 15 && !ownEvents.some(e => e.kind === 'r' && 8 - row(e.to) === rookSeventhRank(color) &&
        ownEvents.indexOf(e) < 15); break;
    case 'secret-garden':
      lost = last?.color === enemy && secretGardenSquares(p.square).some(at =>
        last.to === at || last.castle?.rookTo === at); break;
    case 'siege':
      lost = completed >= 20 && !ownEvents.slice(0, 20).some(e => e.captured === 'r'); break;
    case 'simp': lost = squares(g, color, 'q').length === 0; break;
    case 'three-check': lost = state.players[color].checks >= 3; break;
    case 'tower-defense': lost = squares(g, color, 'r').length === 0; break;
    case 'unspooling': lost = ownEvents.reduce((sum, e) => sum + distance(e.from, e.to), 0) >= 100; break;
    case 'warlord': lost = incoming && completed >= 11 && at !== undefined && advance(at, color) < 2; break;
  }
  return lost ? `${d}: drawback loss condition reached` : null;
}
