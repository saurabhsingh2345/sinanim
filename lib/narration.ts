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
import { WordTiming, buildWordTimeline, SentenceClipInfo } from './word-timeline';
import { splitSentences, hasStepNarration, stepStartsFromSentences } from './step-sync';
import { prosodyPlan } from './prosody';

export { splitSentences };

export interface NarrationResult {
  /** The timeline re-paced so speech always fits. */
  dsl: AnimationDSL;
  /** sceneIndex -> decoded speech, ready to schedule. */
  buffers: Map<number, AudioBuffer>;
  /** sceneIndex -> word timings (seconds relative to scene start) — the master
   *  clock for karaoke captions, narration-paced typing and sync anchors. */
  words: Map<number, WordTiming[]>;
}

/** Pause stitched between sentences (s) — a natural breath. Prosody varies
 *  the real gap per sentence around this base (see lib/prosody.ts). */
export const SENTENCE_GAP = 0.18;

/** Stitch sentence clips into one continuous clip. `gaps[i]` is the silence
 *  after clip i (defaults to the flat SENTENCE_GAP when not provided). */
export function stitchClips(clips: SynthesizedClip[], gaps?: number[]): SynthesizedClip {
  const sampleRate = clips[0]?.sampleRate || 24000;
  const gapAt = (i: number) => Math.round((gaps?.[i] ?? SENTENCE_GAP) * sampleRate);
  const total = clips.reduce(
    (a, c, i) => a + c.samples.length + (i < clips.length - 1 ? gapAt(i) : 0),
    0,
  );
  const samples = new Float32Array(total);
  let at = 0;
  clips.forEach((c, i) => {
    samples.set(c.samples, at);
    at += c.samples.length + (i < clips.length - 1 ? gapAt(i) : 0);
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
  const words = new Map<number, WordTiming[]>();
  const stepSync = new Map<number, number[]>();

  const total = narrated.reduce((a, n) => a + n.sentences.length, 0);
  let done = 0;
  onPhase?.({ phase: 'synthesize', done, total });

  for (const { i, sentences } of narrated) {
    const plan = prosodyPlan(sentences);
    const gaps = plan.map((p) => p.gapAfter);
    const clips: SynthesizedClip[] = [];
    for (let k = 0; k < sentences.length; k++) {
      clips.push(
        await engine.synthesize(sentences[k], voice, (pct) =>
          onPhase?.({ phase: 'download', pct }),
        plan[k].speed),
      );
      done++;
      onPhase?.({ phase: 'synthesize', done, total });
    }
    const clip = stitchClips(clips, gaps);
    const buf = audioCtx.createBuffer(1, clip.samples.length, clip.sampleRate);
    buf.copyToChannel(clip.samples as any, 0);
    buffers.set(i, buf);
    durations.set(i, clip.duration);

    // word timeline: sentence offsets inside the stitched clip are exact;
    // word times within a sentence are estimated over its voiced span.
    const infos: SentenceClipInfo[] = [];
    let offset = 0;
    clips.forEach((c, k) => {
      infos.push({ text: sentences[k], offset, samples: c.samples, sampleRate: c.sampleRate });
      offset += c.samples.length / c.sampleRate + gaps[k];
    });
    words.set(i, buildWordTimeline(infos));

    // per-step sync: a step starts when its first narration sentence is spoken
    const scene = dsl.scenes[i];
    if (scene.type === 'ide' && hasStepNarration(scene.steps)) {
      stepSync.set(i, stepStartsFromSentences(scene.steps, sentences.length, infos.map((x) => x.offset)));
    }
  }

  onPhase?.({ phase: 'ready' });
  const paced = paceToNarration(dsl, durations);
  stepSync.forEach((times, i) => {
    const s = paced.scenes[i];
    if (s.type === 'ide') s.stepNarrationTimes = times;
  });
  return { dsl: paced, buffers, words };
}
