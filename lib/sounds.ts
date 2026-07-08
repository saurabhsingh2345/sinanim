// Sample-based sound engine. All samples are synthesized offline by
// scripts/generate-sounds.mts into public/sounds. Keystrokes rotate through
// five variants with pitch/velocity variation so typing never sounds looped;
// enter and space have their own deeper voices. A MediaStream (captureNode)
// is exposed so everything is muxed into export.

interface Buffers {
  keys: AudioBuffer[];
  space?: AudioBuffer;
  enter?: AudioBuffer;
  click?: AudioBuffer;
  whoosh?: AudioBuffer;
  pop?: AudioBuffer;
  chime?: AudioBuffer;
  buzz?: AudioBuffer;
}

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private capture: MediaStreamAudioDestinationNode | null = null;
  private buffers: Buffers = { keys: [] };
  private loadPromise: Promise<void> | null = null;
  private lastKeyVariant = -1;
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
        const [k1, k2, k3, k4, k5, space, enter, click, whoosh, pop, chime, buzz] =
          await Promise.all([
            get('/sounds/key-1.wav'),
            get('/sounds/key-2.wav'),
            get('/sounds/key-3.wav'),
            get('/sounds/key-4.wav'),
            get('/sounds/key-5.wav'),
            get('/sounds/space.wav'),
            get('/sounds/enter.wav'),
            get('/sounds/click.wav'),
            get('/sounds/whoosh.wav'),
            get('/sounds/pop.wav'),
            get('/sounds/chime.wav'),
            get('/sounds/buzz.wav'),
          ]);
        this.buffers = {
          keys: [k1, k2, k3, k4, k5].filter(Boolean) as AudioBuffer[],
          space, enter, click, whoosh, pop, chime, buzz,
        };
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

  /** The engine's AudioContext (created on demand; may start suspended). */
  get context(): AudioContext {
    return this.ensure();
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

  /** One keystroke. Pass the character so enter/space get their own voice. */
  keystroke(ch?: string) {
    if (ch === '\n' && this.buffers.enter) {
      this.play(this.buffers.enter, 0.5 + Math.random() * 0.1, 0.97 + Math.random() * 0.06);
      return;
    }
    if (ch === ' ' && this.buffers.space) {
      this.play(this.buffers.space, 0.42 + Math.random() * 0.1, 0.96 + Math.random() * 0.08);
      return;
    }
    const keys = this.buffers.keys;
    if (!keys.length) return;
    // round-robin that never repeats the previous variant
    let v = Math.floor(Math.random() * keys.length);
    if (keys.length > 1 && v === this.lastKeyVariant) v = (v + 1) % keys.length;
    this.lastKeyVariant = v;
    this.play(keys[v], 0.38 + Math.random() * 0.14, 0.93 + Math.random() * 0.13);
  }

  click() {
    this.play(this.buffers.click, 0.8, 0.98 + Math.random() * 0.04);
  }

  /** Scene transition breath (chapter/title cards). */
  whoosh() {
    this.play(this.buffers.whoosh, 0.5, 0.96 + Math.random() * 0.08);
  }

  /** Small reveal tick (bullets, diagram nodes). */
  pop() {
    this.play(this.buffers.pop, 0.45, 0.95 + Math.random() * 0.12);
  }

  /** Quiz answered correctly. */
  chime() {
    this.play(this.buffers.chime, 0.6, 1);
  }

  /** Quiz answered wrong — gentle, not punishing. */
  buzz() {
    this.play(this.buffers.buzz, 0.55, 1);
  }

  // ── Narration ──────────────────────────────────────────────────────────────
  // Voice clips route through the same master gain, so they land in the
  // capture stream and get baked into exports automatically.
  private narrationSrc: AudioBufferSourceNode | null = null;

  /** Start a voice clip `offset` seconds in (for seeking). Replaces any playing clip. */
  playNarration(buffer: AudioBuffer, offset = 0, rate = 1) {
    if (this.muted) return;
    const ctx = this.ensure();
    this.stopNarration();
    if (offset >= buffer.duration) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = 0.95;
    src.connect(g).connect(this.master!);
    src.start(0, Math.max(0, offset));
    src.onended = () => {
      if (this.narrationSrc === src) this.narrationSrc = null;
    };
    this.narrationSrc = src;
  }

  stopNarration() {
    if (this.narrationSrc) {
      try { this.narrationSrc.stop(); } catch {}
      this.narrationSrc = null;
    }
  }
}
