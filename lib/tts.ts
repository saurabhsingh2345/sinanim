// Local text-to-speech via Kokoro (82M, Apache-2.0) running fully in the
// browser through kokoro-js — no API key, no cloud, nothing to pay for.
// The model (~90 MB quantized) downloads once and is cached by the browser.

export interface SynthesizedClip {
  samples: Float32Array;
  sampleRate: number;
  /** Seconds of speech. */
  duration: number;
}

export type TTSPhase =
  | { phase: 'idle' }
  | { phase: 'download'; pct: number }
  | { phase: 'synthesize'; done: number; total: number }
  | { phase: 'ready' }
  | { phase: 'error'; message: string };

/** Curated Kokoro voices (id -> label). Full list: tts.list_voices(). */
export const VOICES: { id: string; label: string }[] = [
  { id: 'af_heart', label: 'Heart · female (US)' },
  { id: 'af_bella', label: 'Bella · female (US)' },
  { id: 'af_nicole', label: 'Nicole · female (US, soft)' },
  { id: 'am_michael', label: 'Michael · male (US)' },
  { id: 'am_fenrir', label: 'Fenrir · male (US, deep)' },
  { id: 'bf_emma', label: 'Emma · female (UK)' },
  { id: 'bm_george', label: 'George · male (UK)' },
];
export const DEFAULT_VOICE = 'af_heart';

// ── Chatterbox tier (Resemble AI, MIT) — higher-fidelity, expressive voice ───────
// Runs 100% in-browser via Transformers.js v4 + WebGPU (onnx-community/chatterbox-ONNX,
// ~1.5 GB, cached after first load). It's a zero-shot cloning model, so it needs a
// reference clip: we synthesize one with Kokoro at load (no bundled asset), then
// Chatterbox re-voices it at higher fidelity. Voice ids: "cb:<kokoroVoice>" and
// "cb:<kokoroVoice>:x" (expressive). Fail-soft — any hiccup falls back to Kokoro.
const CHATTERBOX_MODEL = 'onnx-community/chatterbox-ONNX';
const TRANSFORMERS_CDN = 'https://esm.sh/@huggingface/transformers@4';

/** WebGPU is required for the 1.5 GB model to be usable (WASM is impractically slow). */
export function supportsChatterbox(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as any).gpu;
}

/** Chatterbox options surfaced in the voice menu (only when WebGPU is available). */
export const CHATTERBOX_VOICES: { id: string; label: string }[] = [
  { id: 'cb:af_heart', label: 'Heart · Chatterbox HD (WebGPU)' },
  { id: 'cb:af_heart:x', label: 'Heart · Chatterbox HD, expressive' },
  { id: 'cb:am_michael', label: 'Michael · Chatterbox HD (WebGPU)' },
];

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';

// kokoro-js is loaded at runtime as a native ES module. Bundling it breaks:
// Next's minifier can't digest onnxruntime-web's `import.meta` bundle. The
// browser imports straight from the CDN instead (cached by the HTTP cache);
// the npm copy of kokoro-js is still used by Node scripts.
const KOKORO_CDN = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm';

async function importKokoro(): Promise<any> {
  return import(/* webpackIgnore: true */ KOKORO_CDN);
}

export class NarrationEngine {
  private ttsPromise: Promise<any> | null = null;
  private cache = new Map<string, SynthesizedClip>();

  /** Load the Kokoro model (lazy, once). WebGPU when available, else WASM. */
  private load(onProgress?: (pct: number) => void): Promise<any> {
    if (!this.ttsPromise) {
      this.ttsPromise = (async () => {
        const { KokoroTTS } = await importKokoro();
        const webgpu = typeof navigator !== 'undefined' && !!(navigator as any).gpu;
        const opts = (device: string, dtype: string) => ({
          device,
          dtype,
          progress_callback: (p: any) => {
            // transformers.js emits per-file progress; surface the main model file
            if (p?.status === 'progress' && typeof p.progress === 'number') {
              onProgress?.(Math.round(p.progress));
            }
          },
        });
        try {
          return await KokoroTTS.from_pretrained(
            MODEL_ID,
            opts(webgpu ? 'webgpu' : 'wasm', webgpu ? 'fp32' : 'q8') as any,
          );
        } catch (e) {
          if (!webgpu) throw e;
          // WebGPU init can fail on some setups — fall back to WASM
          return await KokoroTTS.from_pretrained(MODEL_ID, opts('wasm', 'q8') as any);
        }
      })();
      this.ttsPromise.catch(() => { this.ttsPromise = null; }); // allow retry
    }
    return this.ttsPromise;
  }

  /** Premium tiers ("oa:*" OpenAI, "el:*" ElevenLabs) proxied via /api/tts —
   *  the server holds the keys; the browser just decodes the MP3. */
  private async synthesizeRemote(text: string, voice: string): Promise<SynthesizedClip> {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || `TTS proxy failed (${res.status})`);
    }
    const bytes = await res.arrayBuffer();
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!this.decodeCtx) this.decodeCtx = new AC();
    const buf = await this.decodeCtx.decodeAudioData(bytes);
    const samples = buf.getChannelData(0).slice();
    return { samples, sampleRate: buf.sampleRate, duration: buf.duration };
  }
  private decodeCtx: AudioContext | null = null;

  // ── Chatterbox (Transformers.js v4, WebGPU) ────────────────────────────────────
  private cbPromise: Promise<{ model: any; processor: any; Tensor: any }> | null = null;
  private cbSpeakers = new Map<string, any>();

  private loadChatterbox(onProgress?: (pct: number) => void): Promise<{ model: any; processor: any; Tensor: any }> {
    if (!this.cbPromise) {
      this.cbPromise = (async () => {
        const t = await import(/* webpackIgnore: true */ TRANSFORMERS_CDN);
        const { ChatterboxModel, AutoProcessor, Tensor } = t;
        const webgpu = typeof navigator !== 'undefined' && !!(navigator as any).gpu;
        const progress_callback = (p: any) => {
          if (p?.status === 'progress' && typeof p.progress === 'number') onProgress?.(Math.round(p.progress));
        };
        const processor = await AutoProcessor.from_pretrained(CHATTERBOX_MODEL);
        const model = await ChatterboxModel.from_pretrained(CHATTERBOX_MODEL, {
          device: webgpu ? 'webgpu' : 'wasm',
          dtype: { language_model: webgpu ? 'q4f16' : 'q4' },
          progress_callback,
        } as any);
        return { model, processor, Tensor };
      })();
      this.cbPromise.catch(() => { this.cbPromise = null; }); // allow retry
    }
    return this.cbPromise;
  }

  /** Speaker embedding for a base Kokoro voice — synthesize a reference clip once
   *  with Kokoro, then encode_speech it. Cached per base voice. */
  private async chatterboxSpeaker(baseVoice: string, model: any, Tensor: any): Promise<any> {
    const cached = this.cbSpeakers.get(baseVoice);
    if (cached) return cached;
    const kokoro = await this.load();
    const ref = await kokoro.generate('This is the reference voice for the lesson narration.', { voice: baseVoice, speed: 1 });
    const refSamples: Float32Array = ref.audio ?? ref.data;
    const tensor = new Tensor('float32', refSamples, [1, refSamples.length]);
    const spk = await model.encode_speech(tensor);
    this.cbSpeakers.set(baseVoice, spk);
    return spk;
  }

  private async synthesizeChatterbox(text: string, voice: string, onProgress?: (pct: number) => void): Promise<SynthesizedClip> {
    const parts = voice.slice(3).split(':'); // "cb:af_heart:x" -> ["af_heart","x"]
    const baseVoice = parts[0] || DEFAULT_VOICE;
    const exaggeration = parts[1] === 'x' ? 0.7 : 0.5;
    const { model, processor, Tensor } = await this.loadChatterbox(onProgress);
    const speaker = await this.chatterboxSpeaker(baseVoice, model, Tensor);
    const inputs = await processor(text);
    const out: any = await model.generate({ ...inputs, ...speaker, exaggeration, max_new_tokens: 1000 });
    const waveform = out?.waveform ?? out;
    const raw = waveform?.data ?? waveform;
    const samples = raw instanceof Float32Array ? raw : new Float32Array(raw);
    const sampleRate = 24000; // Chatterbox S3Gen output rate
    return { samples, sampleRate, duration: samples.length / sampleRate };
  }

  async synthesize(
    text: string,
    voice: string,
    onDownloadProgress?: (pct: number) => void,
    speed = 1,
  ): Promise<SynthesizedClip> {
    const key = `${voice}::${speed}::${text}`;
    const hit = this.cache.get(key);
    if (hit) return hit;

    if (voice.startsWith('oa:') || voice.startsWith('el:')) {
      // premium proxies pace themselves; prosody speed applies to Kokoro only
      const clip = await this.synthesizeRemote(text, voice);
      this.cache.set(key, clip);
      return clip;
    }

    if (voice.startsWith('cb:')) {
      try {
        const clip = await this.synthesizeChatterbox(text, voice, onDownloadProgress);
        this.cache.set(key, clip);
        return clip;
      } catch {
        // Chatterbox unavailable (no WebGPU / load failed) — fall through to Kokoro
        // using the base voice so narration never breaks.
        voice = voice.slice(3).split(':')[0] || DEFAULT_VOICE;
      }
    }

    try {
      const tts = await this.load(onDownloadProgress);
      const audio = await tts.generate(text, { voice, speed });
      const samples: Float32Array = audio.audio ?? audio.data;
      const sampleRate: number = audio.sampling_rate ?? 24000;
      const clip: SynthesizedClip = {
        samples,
        sampleRate,
        duration: samples.length / sampleRate,
      };
      this.cache.set(key, clip);
      return clip;
    } catch {
      // Free local fallback: optional Piper CDN, else Web Speech API.
      const { synthesizeLocalFallback } = await import('./piper');
      const clip = await synthesizeLocalFallback(text);
      this.cache.set(key, clip);
      return clip;
    }
  }
}
