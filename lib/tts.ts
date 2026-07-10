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

  async synthesize(
    text: string,
    voice: string,
    onDownloadProgress?: (pct: number) => void,
  ): Promise<SynthesizedClip> {
    const key = `${voice}::${text}`;
    const hit = this.cache.get(key);
    if (hit) return hit;

    try {
      const tts = await this.load(onDownloadProgress);
      const audio = await tts.generate(text, { voice });
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
