import { afterEach, expect, it, vi } from 'vitest';
import { MoveSound } from '../src/sound';
import { loadSoundPreference } from '../src/storage';

afterEach(() => vi.unstubAllGlobals());

it('defaults to sound on and restores the muted preference', () => {
  for (const [stored, enabled] of [[null, true], ['on', true], ['off', false]] as const) {
    vi.stubGlobal('localStorage', { getItem: () => stored });
    expect(loadSoundPreference()).toEqual({ enabled, error: null });
  }
});

it('unlocks audio lazily, synthesizes one short sound, and releases resources', async () => {
  const source = { buffer: null, connect: vi.fn(), disconnect: vi.fn(),
    start: vi.fn(), onended: null as (() => void) | null };
  const samples = new Float32Array(8640);
  const buffer = { getChannelData: () => samples };
  const context = { state: 'suspended', currentTime: 10, destination: {}, sampleRate: 48000,
    resume: vi.fn(async () => { context.state = 'running'; }),
    close: vi.fn(async () => { context.state = 'closed'; }),
    createBufferSource: vi.fn(() => source), createBuffer: vi.fn(() => buffer) };
  const construct = vi.fn(function () { return context; });
  vi.stubGlobal('AudioContext', construct);
  const sound = new MoveSound();
  sound.play();
  expect(construct).not.toHaveBeenCalled();
  await sound.unlock();
  await sound.unlock();
  expect(construct).toHaveBeenCalledTimes(1);
  expect(context.resume).toHaveBeenCalledTimes(1);
  sound.play();
  expect(source.start).toHaveBeenCalledExactlyOnceWith(10);
  expect(source.buffer).toBe(buffer);
  expect(context.createBuffer).toHaveBeenCalledWith(1, 8640, 48000);
  expect(samples.every(Number.isFinite)).toBe(true);
  const peak = (values: Float32Array) => Math.max(...values.map(Math.abs));
  expect(peak(samples)).toBeGreaterThan(0.1);
  expect(peak(samples)).toBeLessThan(1);
  expect(peak(samples.slice(4800))).toBeLessThan(peak(samples.slice(0, 480)) * 0.05);
  expect(Math.abs(samples[0])).toBe(0);
  expect(Math.abs(samples[samples.length - 1])).toBe(0);
  source.onended!();
  expect(source.disconnect).toHaveBeenCalled();
  sound.play();
  expect(context.createBuffer).toHaveBeenCalledTimes(1);
  await sound.dispose();
  expect(context.close).toHaveBeenCalledTimes(1);
});
