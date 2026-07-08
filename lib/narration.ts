// Narration pipeline: synthesize every scene's `narration` with Kokoro, wrap
// the raw samples in AudioBuffers for the SoundEngine, and stretch the timeline
// so no scene ends before its voice does (paceToNarration).
//
// Kokoro degrades (and can cut out entirely) on long inputs, so narration is
// synthesized ONE SENTENCE AT A TIME and the clips are stitched back together
// with a short breathing gap. A scene's voice can no longer die mid-thought,
// and sentence-level caching means edits only re-synthesize what changed.

import { AnimationDSL } from './types';
import { paceToNarration } from './dsl';
import { DEFAULT_VOICE, NarrationEngine, SynthesizedClip, TTSPhase } from './tts';

export interface NarrationResult {
  /** The timeline re-paced so speech always fits. */
  dsl: AnimationDSL;
  /** sceneIndex -> decoded speech, ready to schedule. */
  buffers: Map<number, AudioBuffer>;
}

/** Pause stitched between sentences (s) — a natural breath. */
const SENTENCE_GAP = 0.18;
/** Kokoro stays reliable under ~300 chars; hard-split anything longer. */
const MAX_SENTENCE = 300;

/** Split narration into speakable sentences; long ones split again at commas. */
export function splitSentences(text: string): string[] {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!flat) return [];
  const rough = flat.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [flat];

  const out: string[] = [];
  for (const r of rough) {
    let s = r.trim();
    while (s.length > MAX_SENTENCE) {
      // prefer a clause boundary, then any space, then a hard cut
      let cut = s.lastIndexOf(', ', MAX_SENTENCE - 20);
      if (cut < 60) cut = s.lastIndexOf('; ', MAX_SENTENCE - 20);
      if (cut < 60) cut = s.lastIndexOf(' ', MAX_SENTENCE - 20);
      if (cut < 60) cut = MAX_SENTENCE - 20;
      out.push(s.slice(0, cut + 1).trim());
      s = s.slice(cut + 1).trim();
    }
    if (s) out.push(s);
  }
  return out;
}

/** Stitch sentence clips into one continuous clip with gaps between them. */
function stitchClips(clips: SynthesizedClip[]): SynthesizedClip {
  const sampleRate = clips[0]?.sampleRate || 24000;
  const gap = Math.round(SENTENCE_GAP * sampleRate);
  const total = clips.reduce((a, c) => a + c.samples.length, 0) + gap * Math.max(0, clips.length - 1);
  const samples = new Float32Array(total);
  let at = 0;
  clips.forEach((c, i) => {
    samples.set(c.samples, at);
    at += c.samples.length + (i < clips.length - 1 ? gap : 0);
  });
  return { samples, sampleRate, duration: total / sampleRate };
}

export async function buildNarration(
  dsl: AnimationDSL,
  engine: NarrationEngine,
  audioCtx: BaseAudioContext,
  onPhase?: (p: TTSPhase) => void,
): Promise<NarrationResult> {
  const voice = dsl.voice || DEFAULT_VOICE;
  const narrated = dsl.scenes
    .map((s, i) => ({ i, sentences: s.narration ? splitSentences(s.narration) : [] }))
    .filter((x) => x.sentences.length > 0);

  const buffers = new Map<number, AudioBuffer>();
  const durations = new Map<number, number>();

  const total = narrated.reduce((a, n) => a + n.sentences.length, 0);
  let done = 0;
  onPhase?.({ phase: 'synthesize', done, total });

  for (const { i, sentences } of narrated) {
    const clips: SynthesizedClip[] = [];
    for (const sentence of sentences) {
      clips.push(
        await engine.synthesize(sentence, voice, (pct) =>
          onPhase?.({ phase: 'download', pct }),
        ),
      );
      done++;
      onPhase?.({ phase: 'synthesize', done, total });
    }
    const clip = stitchClips(clips);
    const buf = audioCtx.createBuffer(1, clip.samples.length, clip.sampleRate);
    buf.copyToChannel(clip.samples as any, 0);
    buffers.set(i, buf);
    durations.set(i, clip.duration);
  }

  onPhase?.({ phase: 'ready' });
  return { dsl: paceToNarration(dsl, durations), buffers };
}
