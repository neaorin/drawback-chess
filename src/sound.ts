import type { Color, Game } from './game';

export type GameSound = 'move' | 'capture' | 'win';

export function soundForTransition(previous: Game, next: Game, viewer: Color): GameSound | null {
  if (!previous.result && next.result?.winner) return 'win';
  if (next.history.length !== previous.history.length + 1) return null;
  const entry = next.history.at(-1)!;
  if (next.drawbacks[viewer] === 'fog' && entry.color !== viewer && !next.result) return 'move';
  return entry.move.capture === undefined ? 'move' : 'capture';
}

export class MoveSound {
  private context: AudioContext | null = null;
  private buffers = new Map<GameSound, AudioBuffer>();

  async unlock(): Promise<void> {
    this.context ??= new AudioContext();
    if (this.context.state === 'suspended') await this.context.resume();
  }

  play(kind: GameSound = 'move'): void {
    const context = this.context;
    // Browsers require a user gesture before audio can start.
    if (!context || context.state !== 'running') return;
    let buffer = this.buffers.get(kind);
    if (!buffer) {
      const duration = kind === 'win' ? 0.9 : kind === 'capture' ? 0.24 : 0.18;
      buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
      const samples = buffer.getChannelData(0);
      let seed = 42, filteredNoise = 0;
      for (let i = 0; i < samples.length; i++) {
        const t = i / context.sampleRate;
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const noise = seed / 0x80000000 - 1;
        filteredNoise += 0.35 * (noise - filteredNoise);
        const fade = Math.min(1, (samples.length - 1 - i) / (context.sampleRate * 0.01));
        if (kind === 'win') {
          let chime = 0;
          for (const [note, frequency] of [523.25, 659.25, 783.99].entries()) {
            const elapsed = t - note * 0.12;
            if (elapsed < 0) continue;
            const envelope = (1 - Math.exp(-elapsed * 180)) * Math.exp(-elapsed * 7);
            chime += envelope * (Math.sin(2 * Math.PI * frequency * elapsed) +
              0.15 * Math.sin(4 * Math.PI * frequency * elapsed)) * 0.16;
          }
          samples[i] = chime * fade;
        } else {
          const heavy = kind === 'capture';
          const attack = 1 - Math.exp(-t * 1800);
          // Short, low resonances avoid a pitched ringing tail on the wooden impact.
          const body = 0.48 * Math.sin(2 * Math.PI * (heavy ? 130 : 175) * t) * Math.exp(-t * (heavy ? 42 : 65)) +
            0.16 * Math.sin(2 * Math.PI * (heavy ? 340 : 430) * t) * Math.exp(-t * 95);
          const impact = filteredNoise * (heavy ? 0.85 : 0.55) * Math.exp(-t * 180);
          const contact = heavy && t >= 0.045 ? 0.22 * Math.sin(2 * Math.PI * 230 * (t - 0.045)) *
            (1 - Math.exp(-(t - 0.045) * 1800)) * Math.exp(-(t - 0.045) * 95) : 0;
          samples[i] = (body + impact + contact) * attack * fade * 0.65;
        }
      }
      this.buffers.set(kind, buffer);
    }
    const source = context.createBufferSource();
    const now = context.currentTime;
    source.buffer = buffer;
    source.connect(context.destination);
    source.onended = () => source.disconnect();
    source.start(now);
  }

  async dispose(): Promise<void> {
    if (this.context && this.context.state !== 'closed') await this.context.close();
    this.context = null;
    this.buffers.clear();
  }
}
