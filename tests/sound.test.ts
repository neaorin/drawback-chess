import { afterEach, expect, it, vi } from 'vitest';
import { MoveSound, soundForTransition, type GameSound } from '../src/sound';
import { loadSoundPreference } from '../src/storage';
import { index, newGame, play } from '../src/game';

afterEach(() => vi.unstubAllGlobals());

it('defaults to sound on and restores the muted preference', () => {
  for (const [stored, enabled] of [[null, true], ['on', true], ['off', false]] as const) {
    vi.stubGlobal('localStorage', { getItem: () => stored });
    expect(loadSoundPreference()).toEqual({ enabled, error: null });
  }
});

it('selects move, capture and win sounds without disclosing hidden captures or replaying history', () => {
  const start = newGame('fog', 'fog', 42);
  const moved = play(start, { from: index('e2'), to: index('e4') });
  const reply = play(moved, { from: index('d7'), to: index('d5') });
  const captured = play(reply, { from: index('e4'), to: index('d5') });
  expect(soundForTransition(start, moved, 'w')).toBe('move');
  expect(soundForTransition(reply, captured, 'w')).toBe('capture');
  expect(soundForTransition(reply, captured, 'b')).toBe('move');
  expect(soundForTransition(captured, captured, 'w')).toBeNull();
  expect(soundForTransition(captured, start, 'w')).toBeNull();
  const won = { ...captured, result: { winner: 'w' as const, reason: 'King captured' } };
  expect(soundForTransition(reply, won, 'b')).toBe('win');
  expect(soundForTransition(captured, won, 'w')).toBe('win');
  expect(soundForTransition(won, won, 'w')).toBeNull();
  expect(soundForTransition(reply, { ...captured, result: { winner: null, reason: 'Draw' } }, 'w')).toBe('capture');
});

it('unlocks lazily, caches distinct bounded sounds, and releases resources', async () => {
  const source = { buffer: null, connect: vi.fn(), disconnect: vi.fn(),
    start: vi.fn(), onended: null as (() => void) | null };
  const context = { state: 'suspended', currentTime: 10, destination: {}, sampleRate: 48000,
    resume: vi.fn(async () => { context.state = 'running'; }),
    close: vi.fn(async () => { context.state = 'closed'; }),
    createBufferSource: vi.fn(() => source), createBuffer: vi.fn((_channels: number, length: number) => {
      const samples = new Float32Array(length);
      return { getChannelData: () => samples };
    }) };
  const construct = vi.fn(function () { return context; });
  vi.stubGlobal('AudioContext', construct);
  const sound = new MoveSound();
  sound.play();
  expect(construct).not.toHaveBeenCalled();
  await sound.unlock();
  await sound.unlock();
  expect(construct).toHaveBeenCalledTimes(1);
  expect(context.resume).toHaveBeenCalledTimes(1);
  const peak = (values: Float32Array) => Math.max(...values.map(Math.abs));
  for (const [kind, duration] of [['move', 0.18], ['capture', 0.24], ['win', 0.9]] satisfies [GameSound, number][]) {
    sound.play(kind);
    expect(context.createBuffer).toHaveBeenLastCalledWith(1, Math.ceil(48000 * duration), 48000);
    const buffer = context.createBuffer.mock.results.at(-1)!.value;
    const samples = buffer.getChannelData();
    expect(source.buffer).toBe(buffer);
    expect(samples.every(Number.isFinite)).toBe(true);
    expect(peak(samples)).toBeGreaterThan(0.1);
    expect(peak(samples)).toBeLessThan(1);
    expect(Math.abs(samples[0])).toBe(0);
    expect(Math.abs(samples[samples.length - 1])).toBe(0);
    sound.play(kind);
    expect(source.buffer).toBe(buffer);
  }
  source.onended!();
  expect(source.disconnect).toHaveBeenCalled();
  expect(source.start).toHaveBeenCalledTimes(6);
  expect(context.createBuffer).toHaveBeenCalledTimes(3);
  await sound.dispose();
  expect(context.close).toHaveBeenCalledTimes(1);
});
