// Narration pipeline: synthesize every scene's `narration` with Kokoro, wrap
// the raw samples in AudioBuffers for the SoundEngine, and stretch the timeline
// so no scene ends before its voice does (paceToNarration).

import { AnimationDSL } from './types';
import { paceToNarration } from './dsl';
import { DEFAULT_VOICE, NarrationEngine, TTSPhase } from './tts';

export interface NarrationResult {
  /** The timeline re-paced so speech always fits. */
  dsl: AnimationDSL;
  /** sceneIndex -> decoded speech, ready to schedule. */
  buffers: Map<number, AudioBuffer>;
}

export async function buildNarration(
  dsl: AnimationDSL,
  engine: NarrationEngine,
  audioCtx: BaseAudioContext,
  onPhase?: (p: TTSPhase) => void,
): Promise<NarrationResult> {
  const voice = dsl.voice || DEFAULT_VOICE;
  const narrated = dsl.scenes
    .map((s, i) => ({ i, text: s.narration }))
    .filter((x): x is { i: number; text: string } => !!x.text);

  const buffers = new Map<number, AudioBuffer>();
  const durations = new Map<number, number>();

  let done = 0;
  for (const { i, text } of narrated) {
    onPhase?.({ phase: 'synthesize', done, total: narrated.length });
    const clip = await engine.synthesize(text, voice, (pct) =>
      onPhase?.({ phase: 'download', pct }),
    );
    const buf = audioCtx.createBuffer(1, clip.samples.length, clip.sampleRate);
    buf.copyToChannel(clip.samples as any, 0);
    buffers.set(i, buf);
    durations.set(i, clip.duration);
    done++;
    onPhase?.({ phase: 'synthesize', done, total: narrated.length });
  }

  onPhase?.({ phase: 'ready' });
  return { dsl: paceToNarration(dsl, durations), buffers };
}
