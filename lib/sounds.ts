// Sample-based sound engine. All samples are synthesized offline by
// scripts/generate-sounds.mts into public/sounds. Keystrokes rotate through
// five variants with pitch/velocity variation so typing never sounds looped;
// enter and space have their own deeper voices. A MediaStream (captureNode)
// is exposed so everything is muxed into export.

export interface SampleBuffers {
  keys: AudioBuffer[];
  space?: AudioBuffer;
  enter?: AudioBuffer;
  click?: AudioBuffer;
  whoosh?: AudioBuffer;
  pop?: AudioBuffer;
  chime?: AudioBuffer;
  buzz?: AudioBuffer;
}

/** What the Conductor needs from a sound backend. The live SoundEngine plays
 *  immediately; the SfxCollector records timestamped events for offline mixes. */
export interface SfxSink {
  keystroke(ch?: string): void;
  click(): void;
  whoosh(volume?: number): void;
  pop(volume?: number, rate?: number): void;
  chime(): void;
  buzz(): void;
  playNarration(buffer: AudioBuffer, offset?: number, rate?: number): void;
  stopNarration(): void;
}

export class SoundEngine implements SfxSink {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private capture: MediaStreamAudioDestinationNode | null = null;
  private buffers: SampleBuffers = { keys: [] };
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

  /** Decoded samples, for offline mixes (call resume() first). */
  get sampleBuffers(): SampleBuffers {
    return this.buffers;
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

  /** One keystroke (terminal output only). Kept deliberately quiet — the old
   *  full-volume clatter was the #1 listener complaint. */
  keystroke(ch?: string) {
    if (ch === '\n' && this.buffers.enter) {
      this.play(this.buffers.enter, 0.26 + Math.random() * 0.06, 0.97 + Math.random() * 0.06);
      return;
    }
    if (ch === ' ' && this.buffers.space) {
      this.play(this.buffers.space, 0.2 + Math.random() * 0.06, 0.96 + Math.random() * 0.08);
      return;
    }
    const keys = this.buffers.keys;
    if (!keys.length) return;
    // round-robin that never repeats the previous variant
    let v = Math.floor(Math.random() * keys.length);
    if (keys.length > 1 && v === this.lastKeyVariant) v = (v + 1) % keys.length;
    this.lastKeyVariant = v;
    this.play(keys[v], 0.17 + Math.random() * 0.07, 0.93 + Math.random() * 0.13);
  }

  click() {
    this.play(this.buffers.click, 0.8, 0.98 + Math.random() * 0.04);
  }

  /** Scene transition breath (chapter/title cards, code morphs). */
  whoosh(volume = 0.5) {
    this.play(this.buffers.whoosh, volume, 0.96 + Math.random() * 0.08);
  }

  /** Small reveal tick (bullets, diagram nodes, landing code lines). */
  pop(volume = 0.45, rate?: number) {
    this.play(this.buffers.pop, volume, rate ?? 0.95 + Math.random() * 0.12);
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

// ── Offline SFX collection ──────────────────────────────────────────────────────
// The fast (WebCodecs) exporter can't capture a live AudioContext, so it runs
// the Conductor over virtual time with this sink instead: every sound becomes a
// timestamped event, then the whole mix is rendered in one OfflineAudioContext
// pass — identical sounds, no real-time wait.

export interface SfxEvent {
  kind: 'sfx' | 'voice';
  buffer: AudioBuffer;
  /** Timeline seconds when the sound starts. */
  at: number;
  gain: number;
  rate: number;
  /** Seconds into the buffer to start from (narration seeks). */
  offset?: number;
  /** Timeline seconds to cut the sound (narration replaced by the next clip). */
  stopAt?: number;
}

export class SfxCollector implements SfxSink {
  /** Timeline position of the tick being simulated — set before each tick. */
  now = 0;
  readonly events: SfxEvent[] = [];
  private lastKeyVariant = -1;
  private narrationEvent: SfxEvent | null = null;

  constructor(private buffers: SampleBuffers) {}

  private add(buffer: AudioBuffer | undefined, gain: number, rate: number) {
    if (!buffer) return;
    this.events.push({ kind: 'sfx', buffer, at: this.now, gain, rate });
  }

  keystroke(ch?: string) {
    if (ch === '\n' && this.buffers.enter) {
      this.add(this.buffers.enter, 0.26 + Math.random() * 0.06, 0.97 + Math.random() * 0.06);
      return;
    }
    if (ch === ' ' && this.buffers.space) {
      this.add(this.buffers.space, 0.2 + Math.random() * 0.06, 0.96 + Math.random() * 0.08);
      return;
    }
    const keys = this.buffers.keys;
    if (!keys.length) return;
    let v = Math.floor(Math.random() * keys.length);
    if (keys.length > 1 && v === this.lastKeyVariant) v = (v + 1) % keys.length;
    this.lastKeyVariant = v;
    this.add(keys[v], 0.17 + Math.random() * 0.07, 0.93 + Math.random() * 0.13);
  }

  click() { this.add(this.buffers.click, 0.8, 0.98 + Math.random() * 0.04); }
  whoosh(volume = 0.5) { this.add(this.buffers.whoosh, volume, 0.96 + Math.random() * 0.08); }
  pop(volume = 0.45, rate?: number) { this.add(this.buffers.pop, volume, rate ?? 0.95 + Math.random() * 0.12); }
  chime() { this.add(this.buffers.chime, 0.6, 1); }
  buzz() { this.add(this.buffers.buzz, 0.55, 1); }

  playNarration(buffer: AudioBuffer, offset = 0, rate = 1) {
    this.stopNarration();
    if (offset >= buffer.duration) return;
    const ev: SfxEvent = { kind: 'voice', buffer, at: this.now, gain: 0.95, rate, offset: Math.max(0, offset) };
    this.events.push(ev);
    this.narrationEvent = ev;
  }

  stopNarration() {
    if (this.narrationEvent) {
      this.narrationEvent.stopAt = this.now;
      this.narrationEvent = null;
    }
  }
}

/** Render collected events into a single stereo mix. */
export async function renderSfxMix(
  events: SfxEvent[],
  duration: number,
  sampleRate = 48000,
): Promise<AudioBuffer> {
  const OAC: typeof OfflineAudioContext =
    (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const ctx = new OAC(2, Math.ceil((duration + 0.3) * sampleRate), sampleRate);
  for (const ev of events) {
    if (ev.stopAt != null && ev.stopAt <= ev.at + 1e-3) continue;
    const src = ctx.createBufferSource();
    src.buffer = ev.buffer;
    src.playbackRate.value = ev.rate;
    const g = ctx.createGain();
    g.gain.value = ev.gain;
    src.connect(g).connect(ctx.destination);
    src.start(Math.max(0, ev.at), ev.offset ?? 0);
    if (ev.stopAt != null) src.stop(ev.stopAt);
  }
  return ctx.startRendering();
}
