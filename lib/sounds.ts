// Sample-based UI sound. Two short recorded WAVs (public/sounds) are decoded once
// and played as one-shots with slight pitch/volume variation so repeats feel
// natural. A MediaStream (captureNode) is exposed so sounds are muxed into export.

interface Buffers {
  key?: AudioBuffer;
  click?: AudioBuffer;
}

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private capture: MediaStreamAudioDestinationNode | null = null;
  private buffers: Buffers = {};
  private loadPromise: Promise<void> | null = null;
  muted = false;

  private ensure(): AudioContext {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
      this.capture = this.ctx.createMediaStreamDestination();
      this.master.connect(this.capture);
    }
    return this.ctx;
  }

  private async load(): Promise<void> {
    if (!this.loadPromise) {
      const ctx = this.ensure();
      const get = async (url: string): Promise<AudioBuffer | undefined> => {
        try {
          const res = await fetch(url);
          if (!res.ok) return undefined;
          return await ctx.decodeAudioData(await res.arrayBuffer());
        } catch {
          return undefined;
        }
      };
      this.loadPromise = (async () => {
        const [key, click] = await Promise.all([
          get('/sounds/key.wav'),
          get('/sounds/click.wav'),
        ]);
        this.buffers = { key, click };
      })();
    }
    return this.loadPromise;
  }

  /** Call from a user gesture (play/export). Resolves once samples are decoded. */
  async resume() {
    const ctx = this.ensure();
    if (ctx.state === 'suspended') await ctx.resume();
    await this.load();
  }

  get captureStream(): MediaStream | null {
    this.ensure();
    return this.capture?.stream ?? null;
  }

  private play(buffer: AudioBuffer | undefined, volume: number, rate: number) {
    if (this.muted || !this.ctx || !this.master || !buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(this.master);
    src.start();
  }

  keystroke() {
    this.play(this.buffers.key, 0.5 + Math.random() * 0.12, 0.95 + Math.random() * 0.1);
  }

  click() {
    this.play(this.buffers.click, 0.85, 0.98 + Math.random() * 0.04);
  }
}
