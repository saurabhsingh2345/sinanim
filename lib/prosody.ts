// Sentence-level prosody for the open-source voice pipeline. Kokoro reads
// every sentence at the same clip with the same flat 0.18s gap — that uniform
// delivery is most of what reads as "robotic". This module decides, per
// sentence, how FAST to speak it and how LONG to breathe after it, from cheap
// text heuristics plus a deterministic per-sentence jitter (hash-seeded, so
// renders are reproducible and no two sentences share the exact same pace).
//
// Used by both narration paths (browser lib/narration.ts, Node render-video).

export interface Prosody {
  /** Kokoro speed multiplier (1 = neutral). */
  speed: number;
  /** Silence stitched AFTER this sentence (s). Ignored for the last one. */
  gapAfter: number;
}

/** Base breath between sentences (s) — modifiers move around this. */
export const BASE_GAP = 0.18;

/** Deterministic hash → [0,1). Keeps renders reproducible. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

const CODEY =
  /\b(dot|underscore|slash|bracket|brace|paren|colon|equals|arrow|backtick)\b|`[^`]+`|'[^']{2,30}'|"[^"]{2,30}"/i;

export function prosodyFor(sentence: string, index: number, total: number): Prosody {
  const words = sentence.trim().split(/\s+/).filter(Boolean).length;
  let speed = 1.0;
  let gap = BASE_GAP;

  // Questions hang in the air — say them a touch slower, then wait.
  if (/\?["')\]]*$/.test(sentence)) { speed -= 0.03; gap += 0.22; }
  // Excitement keeps its energy but still gets a beat to land.
  else if (/!["')\]]*$/.test(sentence)) { speed += 0.02; gap += 0.12; }

  // Short punchy lines are deliberate; the pause is the punchline.
  if (words <= 6) { speed -= 0.04; gap += 0.14; }
  // Long explanatory sentences keep momentum so they don't drone.
  else if (words >= 22) { speed += 0.04; gap -= 0.03; }

  // Sentences that carry code terms slow down — the learner is reading along.
  if (CODEY.test(sentence)) { speed -= 0.05; gap += 0.08; }

  // Openers settle in; closers wind down.
  if (index === 0) speed -= 0.02;
  if (index === total - 1) { speed -= 0.03; gap += 0.1; }

  // Colon/ellipsis endings lead INTO the next thought — shorter breath.
  if (/[:;]["')\]]*$|\.\.\.$/.test(sentence)) gap -= 0.06;

  // Humanizing jitter, seeded by the sentence itself.
  const j = hash01(sentence);
  speed += (j - 0.5) * 0.05;
  gap += (hash01(sentence + '|g') - 0.5) * 0.08;

  return {
    speed: Math.min(1.08, Math.max(0.88, Number(speed.toFixed(3)))),
    gapAfter: Math.min(0.55, Math.max(0.12, Number(gap.toFixed(3)))),
  };
}

/** Per-sentence prosody for a whole narration blob. */
export function prosodyPlan(sentences: string[]): Prosody[] {
  return sentences.map((s, i) => prosodyFor(s, i, sentences.length));
}
