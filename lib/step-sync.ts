// Per-step narration sync — the engine behind the "explain every line" IDE.
//
// An ide scene's steps may each carry their own `narration`. At normalize time
// the scene's spoken text becomes intro + every step narration joined (each
// forced to end with sentence punctuation, so sentence counts stay exact).
// After synthesis, the stitched clip's per-sentence offsets are mapped back to
// steps: a step BEGINS exactly when its first narration sentence is spoken.
// That single invariant produces the teaching rhythm the weights model never
// could — type lands with "let's write…", the highlight glows on "look at…",
// the run fires on "let's run it", and the hold lasts as long as the teacher
// keeps talking.
//
// This module is import-cycle-free on purpose: dsl.ts (normalize) and
// narration.ts / render-video.mts (sync attach) both depend on it.

import type { Scene } from './types';

export const MAX_SENTENCE = 300;

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

/** Force a narration fragment to end like a sentence, so joined fragments
 *  split back into the same sentence counts they contributed. */
export function ensureSentenceEnd(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return /[.!?]["')\]]*$/.test(t) ? t : `${t}.`;
}

export function hasStepNarration(steps: { narration?: string }[]): boolean {
  return steps.some((s) => s.narration && s.narration.trim());
}

/** Scene narration = intro (optional) + each step's narration, in step order. */
export function composeStepNarration(
  intro: string | undefined,
  steps: { narration?: string }[],
): string {
  const parts = [intro, ...steps.map((s) => s.narration)]
    .filter((p): p is string => !!(p && p.trim()))
    .map(ensureSentenceEnd);
  return parts.join(' ');
}

/**
 * The full spoken text of a scene, derived ON READ.
 *
 * For an ide scene the teaching lives in the per-step narrations; the scene's
 * own `narration` is only the short intro. We compose them here at the moment
 * of consumption (TTS, captions, word counts, lint) rather than baking the
 * composition back into `scene.narration` — because that field round-trips
 * through the LLM critic/narration/lint passes, and a composed value fed back
 * in gets re-composed every pass, stacking the whole script 2-4× (the "why is
 * it saying everything four times" bug). Deriving on read is idempotent.
 */
export function spokenNarration(scene: Scene): string {
  if (scene.type === 'ide' && Array.isArray(scene.steps) && hasStepNarration(scene.steps)) {
    return composeStepNarration(scene.narration, scene.steps);
  }
  return scene.narration || '';
}

/**
 * Map steps to start times (seconds inside the scene's stitched narration
 * clip). `sentenceOffsets[k]` is the exact start of sentence k. The intro's
 * sentence count is derived arithmetically: total sentences minus the steps'
 * own counts — the composed text needn't be de-composed.
 * Steps without narration slot in just before the next narrated step.
 */
export function stepStartsFromSentences(
  steps: { narration?: string }[],
  totalSentences: number,
  sentenceOffsets: number[],
): number[] {
  const counts = steps.map((st) =>
    st.narration && st.narration.trim() ? splitSentences(ensureSentenceEnd(st.narration)).length : 0,
  );
  const stepTotal = counts.reduce((a, n) => a + n, 0);
  const lastIdx = Math.max(sentenceOffsets.length - 1, 0);
  // Normally intro + steps re-split to exactly `totalSentences` and each step
  // maps to its own sentence offset. If the counts OVERSHOOT (re-split drift),
  // don't let every late step collapse onto the final sentence — spread the
  // narrated steps proportionally across the real sentences instead.
  const overflow = stepTotal > totalSentences && stepTotal > 0;
  let cursor = Math.max(0, totalSentences - stepTotal); // intro sentences come first
  let cumBefore = 0;
  const raw: (number | null)[] = counts.map((n) => {
    if (!n) { return null; }
    const idx = overflow ? Math.round((cumBefore / stepTotal) * totalSentences) : cursor;
    cursor += n;
    cumBefore += n;
    return sentenceOffsets[Math.min(Math.max(idx, 0), lastIdx)] ?? null;
  });
  const out: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] != null) { out.push(raw[i]!); continue; }
    let next: number | null = null;
    for (let j = i + 1; j < raw.length; j++) if (raw[j] != null) { next = raw[j]!; break; }
    const prev = i > 0 ? out[i - 1] : 0;
    // silent step: right after the previous beat, nudged clear of the next voice
    out.push(next != null ? Math.max(prev + 0.25, next - 0.6) : prev + 0.6);
  }
  for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1] + 0.05);
  return out;
}
