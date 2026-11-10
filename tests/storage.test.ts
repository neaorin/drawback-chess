import { describe, expect, it, vi } from 'vitest';
import { index, newGame, play, repetitionCount } from '../src/game';
import { isNewGameChoices, isSaved, loadNewGameChoices, loadSaved, type Saved } from '../src/storage';

const saved = (): Saved => ({ version: 1, game: newGame('horse', 'cess'), mode: 'ai', human: 'w', flipped: false, strength: 400 });
describe('New Game choices', () => {
  const choices = { mode: 'ai', human: 'b', strength: 900, drawback: 'random-easy', opponentDrawback: 'secret-garden' };
  it('restores validated selections including random difficulty bands', () => {
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(choices) });
    try {
      expect(loadNewGameChoices()).toEqual({ choices, error: null });
      expect(isNewGameChoices({ ...choices, drawback: 'random', opponentDrawback: 'random-hard' })).toBe(true);
    } finally { vi.unstubAllGlobals(); }
  });
  it('rejects invalid values and reports corrupt preferences without discarding the game', () => {
    for (const [key, value] of Object.entries({ mode: 'online', human: 'x', strength: '900', drawback: 'unknown', opponentDrawback: null })) {
      expect(isNewGameChoices({ ...choices, [key]: value })).toBe(false);
    }
    vi.stubGlobal('localStorage', { getItem: () => '{bad' });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(loadNewGameChoices()).toEqual({ choices: null, error: expect.stringContaining('could not be restored') });
      expect(log).toHaveBeenCalled();
    } finally { log.mockRestore(); vi.unstubAllGlobals(); }
  });
});
describe('saved game validation', () => {
  it('accepts a round-tripped game', () => expect(isSaved(JSON.parse(JSON.stringify(saved())))).toBe(true));
  it('accepts draws but rejects invalid winners and repetition counts', () => {
    const value = saved();
    value.game.result = { winner: null, reason: 'Threefold repetition' };
    expect(isSaved(JSON.parse(JSON.stringify(value)))).toBe(true);
    Reflect.set(value.game.result, 'winner', 'draw');
    expect(isSaved(value)).toBe(false);
    value.game.result = null;
    for (const repetitions of [null, { key: 0 }, { key: -1 }, { key: 1.5 }, { key: '2' }]) {
      Reflect.set(value.game, 'repetitions', repetitions);
      expect(isSaved(value)).toBe(false);
    }
  });
  it('restores occurrence counts from a legacy save and preserves them on reload', () => {
    const value = saved();
    for (const [from, to] of [['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8']]) {
      value.game = play(value.game, { from: index(from), to: index(to) });
    }
    const expected = value.game.repetitions;
    delete value.game.repetitions;
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(value) });
    try {
      const restored = loadSaved();
      expect(restored.error).toBeNull();
      expect(restored.saved!.game.repetitions).toEqual(expected);
      expect(repetitionCount(restored.saved!.game)).toBe(2);
      value.game = restored.saved!.game;
      expect(loadSaved().saved!.game.repetitions).toEqual(expected);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it.each(['board', 'history', 'rights', 'turns', 'lastKingTurn', 'lastPawn', 'kingPass', 'ep', 'result', 'revealed', 'drawbacks'])('rejects a missing %s without crashing the app', key => {
    const value = saved();
    Reflect.deleteProperty(value.game, key);
    expect(isSaved(value)).toBe(false);
  });
  it('rejects invalid board pieces, squares and history', () => {
    const value = saved();
    Reflect.set(value.game.board, 0, { color: 'x', kind: 'r' });
    expect(isSaved(value)).toBe(false);
    const badMove = saved();
    Reflect.set(badMove.game, 'history', [{ color: 'w', label: 'bad', move: { from: -1, to: 70 } }]);
    expect(isSaved(badMove)).toBe(false);
  });
  it('reports corrupt JSON visibly rather than failing during render', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{bad json' });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(loadSaved()).toEqual({ saved: null, error: expect.stringContaining('could not be restored') });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
    vi.unstubAllGlobals();
  });
});
