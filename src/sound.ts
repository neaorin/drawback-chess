export class MoveSound {
  private context: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;

  async unlock(): Promise<void> {
    this.context ??= new AudioContext();
    if (this.context.state === 'suspended') await this.context.resume();
  }

  play(): void {
    const context = this.context;
    // Browsers require a user gesture before audio can start.
    if (!context || context.state !== 'running') return;
    if (!this.buffer) {
      this.buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.18), context.sampleRate);
      const samples = this.buffer.getChannelData(0);
      let seed = 42, filteredNoise = 0;
      for (let i = 0; i < samples.length; i++) {
        const t = i / context.sampleRate;
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const noise = seed / 0x80000000 - 1;
        filteredNoise += 0.35 * (noise - filteredNoise);
        const attack = 1 - Math.exp(-t * 4500);
        // Inharmonic, damped resonances give the impact a wooden rather than musical tone.
        const body = 0.38 * Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t * 48) +
          0.22 * Math.sin(2 * Math.PI * 487 * t) * Math.exp(-t * 72) +
          0.12 * Math.sin(2 * Math.PI * 1123 * t) * Math.exp(-t * 110);
        const impact = filteredNoise * 0.6 * Math.exp(-t * 210);
        const fade = Math.min(1, (samples.length - 1 - i) / (context.sampleRate * 0.01));
        samples[i] = (body + impact) * attack * fade * 0.65;
      }
    }
    const source = context.createBufferSource();
    const now = context.currentTime;
    source.buffer = this.buffer;
    source.connect(context.destination);
    source.onended = () => source.disconnect();
    source.start(now);
  }

  async dispose(): Promise<void> {
    if (this.context && this.context.state !== 'closed') await this.context.close();
    this.context = null;
    this.buffer = null;
  }
}
