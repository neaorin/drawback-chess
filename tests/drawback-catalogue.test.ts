import { describe, expect, it } from 'vitest';
import { DRAWBACKS, drawbackDescription, legalMoves, newGame, play, positionAt, randomDrawback, uci } from '../src/game';
import { POSITIONAL_IDS } from '../src/drawback-positional';
import { TEMPORAL_IDS } from '../src/drawback-temporal';
import { LOSS_IDS } from '../src/drawback-losses';
import { needsEngineBan, templateDescription } from '../src/drawback-state';
import { DIFFICULTY_LEVELS, difficultyLevel } from '../src/drawback-catalogue';

describe('complete glossary coverage', () => {
  it('keeps Expedition rank details in the glossary but not the in-game description', () => {
    const g = newGame('expedition', 'expedition', 42);
    for (const color of ['w', 'b'] as const) {
      const { move, square } = g.rules!.params[color];
      const target = 'abcdefgh'[square % 8] + (8 - Math.floor(square / 8));
      expect(drawbackDescription(g, color)).toBe(`On move ${move}, you must move to ${target}`);
    }
    const description = DRAWBACKS.find(d => d.id === 'expedition')!.description;
    expect(templateDescription(description)).toBe('On move N (assigned at game start), you must move to a random square (on ranks 6 or 7 as White, or 3 or 2 as Black)');
  });

  it('describes the rook target for the player while keeping the glossary color-neutral', () => {
    const g = newGame('rook-on-the-seventh', 'rook-on-the-seventh');
    g.rules!.params.w.rank = 2;
    g.rules!.params.b.rank = 7;
    expect(drawbackDescription(g, 'w')).toBe('By move 15, you must move one of your rooks onto rank 7');
    expect(drawbackDescription(g, 'b')).toBe('By move 15, you must move one of your rooks onto rank 2');
    const description = DRAWBACKS.find(d => d.id === 'rook-on-the-seventh')!.description;
    expect(templateDescription(description)).toBe('By move 15, you must move one of your rooks onto rank 7 as White or rank 2 as Black');
  });
  it.each(DIFFICULTY_LEVELS)('random $label draws only from that band', level => {
    for (let i = 0; i < 100; i++) {
      const id = randomDrawback(level.choice);
      const selected = DRAWBACKS.find(d => d.id === id)!;
      expect(difficultyLevel(selected.difficulty)).toBe(level);
    }
  });
  it.each([
    [0, 'Very easy'], [19, 'Very easy'], [20, 'Easy'], [39, 'Easy'],
    [40, 'Medium'], [59, 'Medium'], [60, 'Hard'], [79, 'Hard'],
    [80, 'Very hard'], [100, 'Very hard'],
  ] as const)('labels difficulty %s as %s', (difficulty, label) => {
    expect(difficultyLevel(difficulty).label).toBe(label);
  });
  it('stores a truncated integer difficulty between 0 and 100 for every drawback', () => {
    for (const drawback of DRAWBACKS) {
      expect(Number.isInteger(drawback.difficulty), drawback.name).toBe(true);
      expect(drawback.difficulty).toBeGreaterThanOrEqual(0);
      expect(drawback.difficulty).toBeLessThanOrEqual(100);
    }
    expect(DRAWBACKS.find(d => d.id === 'absolution')?.difficulty).toBe(27);
    expect(DRAWBACKS.find(d => d.id === 'alternator')?.difficulty).toBe(95);
    expect(DRAWBACKS.find(d => d.id === 'active-volcano')?.difficulty).toBe(17);
  });

  it('has 181 unique names and IDs with no unenforced catalogue entries', () => {
    expect(DRAWBACKS).toHaveLength(181);
    expect(new Set(DRAWBACKS.map(d => d.name)).size).toBe(181);
    expect(new Set(DRAWBACKS.map(d => d.id)).size).toBe(181);
    const handled = new Set<string>([
      ...POSITIONAL_IDS, ...TEMPORAL_IDS, ...LOSS_IDS,
      'command', 'even', 'alternator', 'horse', 'cess', 'fog', 'now-kiss', 'ichthyophobe', 'shapeshifter',
    ]);
    expect(DRAWBACKS.filter(d => !handled.has(d.id)).map(d => d.id)).toEqual([]);
    expect([...handled].filter(id => !DRAWBACKS.some(d => d.id === id))).toEqual([]);
  });

  it.each([1, 42, 0xffffffff])('enforces deterministic moves and reconstructs every drawback for seed %s', seed => {
    for (const d of DRAWBACKS) {
      let g = newGame(d.id, 'horse', seed);
      const positions = [g];
      for (let ply = 0; ply < 16 && !g.result; ply++) {
        if (needsEngineBan(g)) {
          const unrestricted = { ...g, drawbacks: { ...g.drawbacks, [g.turn]: null } };
          const options = legalMoves(unrestricted);
          if (!options.length) break;
          g.rules!.engineBans[ply] = uci(options[0]);
          if (!legalMoves(g).length) break;
        }
        const moves = legalMoves(g);
        expect(moves.length, `${d.id}: ${seed}/${ply}`).toBeGreaterThan(0);
        expect(legalMoves(JSON.parse(JSON.stringify(g)))).toEqual(moves);
        g = play(g, moves[(seed >>> 0) % moves.length]);
        positions.push(g);
      }
      for (let ply = 0; ply < positions.length; ply++) {
        const reconstructed = positionAt(g, ply);
        expect(reconstructed.board, `${d.id}: board at ${ply}`).toEqual(positions[ply].board);
        expect(reconstructed.turns, `${d.id}: turns at ${ply}`).toEqual(positions[ply].turns);
        expect(reconstructed.rules?.events, `${d.id}: events at ${ply}`).toEqual(positions[ply].rules?.events);
      }
    }
  }, 60000);
});
