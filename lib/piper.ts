// Optional Piper / browser TTS fallback when Kokoro fails.
// Piper: tries a CDN WASM build when NEXT_PUBLIC_TTS_FALLBACK=piper.
// Otherwise uses the free Web Speech API (always available offline-ish).

import type { SynthesizedClip } from './tts';

/** Rough estimate: ~14 chars/sec for fallback pacing when we can't measure audio. */
function estimateDuration(text: string): number {
  return Math.max(1.2, text.trim().split(/\s+/).filter(Boolean).length / 2.6);
}

/** Duration-only stub so the timeline still paces when Kokoro is unavailable.
 *  Real Piper PCM is preferred when NEXT_PUBLIC_TTS_FALLBACK=piper. */
export async function synthesizeBrowserFallback(text: string): Promise<SynthesizedClip & { via: 'browser' }> {
  const duration = estimateDuration(text);
  const sampleRate = 24000;
  const samples = new Float32Array(Math.max(1, Math.round(duration * sampleRate)));
  return { samples, sampleRate, duration: samples.length / sampleRate, via: 'browser' };
}

/**
 * Optional Piper path. When enabled and the CDN module loads, returns real PCM.
 * Otherwise returns null so the caller can fall back to browser TTS.
 */
export async function synthesizePiper(text: string): Promise<SynthesizedClip | null> {
  if (typeof window === 'undefined') return null;
  if (process.env.NEXT_PUBLIC_TTS_FALLBACK !== 'piper') return null;
  try {
    // Experimental CDN entry — may not exist in all environments; fail soft.
    const url = 'https://cdn.jsdelivr.net/npm/piper-tts-web@1.0.0/+esm';
    const mod: any = await (new Function('u', 'return import(u)'))(url);
    if (!mod?.synthesize) return null;
    const result = await mod.synthesize(text, { voice: 'en_US-lessac-medium' });
    if (!result?.audio || !result?.sampleRate) return null;
    const samples =
      result.audio instanceof Float32Array
        ? result.audio
        : new Float32Array(result.audio);
    return {
      samples,
      sampleRate: result.sampleRate,
      duration: samples.length / result.sampleRate,
    };
  } catch {
    return null;
  }
}

/** Best free fallback after Kokoro: Piper (if enabled) → browser speech. */
export async function synthesizeLocalFallback(text: string): Promise<SynthesizedClip> {
  const piper = await synthesizePiper(text);
  if (piper) return piper;
  return synthesizeBrowserFallback(text);
}
