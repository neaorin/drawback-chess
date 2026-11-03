import { describe, expect, it, vi } from 'vitest';
import { newGame } from './game';
import { isSaved, loadSaved, type Saved } from './storage';

const saved = (): Saved => ({ version: 1, game: newGame('horse', 'cess'), mode: 'ai', human: 'w', flipped: false, strength: 400 });
describe('saved game validation', () => {
  it('accepts a round-tripped game', () => expect(isSaved(JSON.parse(JSON.stringify(saved())))).toBe(true));
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
