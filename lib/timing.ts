// Human-like typing schedule. Typing is not machine-uniform: keystrokes jitter,
// the typist rests after punctuation, occasionally rattles off a familiar burst,
// and pauses before starting the next line. We precompute, for a block of text,
// the exact time each character appears (relative to the scene start). The renderer
// and the sound Conductor both consume this so visuals and key clicks stay in sync.
// Everything is deterministic (seeded from the text) so export matches preview.

import { hash01 } from './utils';

export const LINE_PAUSE = 0.4; // seconds of rest after each newline

/** Extra rest after these characters, in units of one base keystroke. */
const AFTER_PAUSE: Record<string, number> = {
  '.': 2.1,
  ',': 1.5,
  ';': 1.7,
  ':': 1.5,
  '{': 1.9,
  '}': 1.3,
  '(': 1.1,
  ')': 1.1,
  ' ': 0.35,
};

/** Reveal time (s, relative to scene start) for each character index in `text`. */
export function typeSchedule(
  text: string,
  speed: number,
  linePause = LINE_PAUSE,
): number[] {
  const times = new Array<number>(text.length);
  const dt = speed > 0 ? 1 / speed : 0;

  // seed from the text so the same snippet always types with the same rhythm
  let seed = 0;
  for (let i = 0; i < Math.min(text.length, 48); i++) {
    seed = (seed * 31 + text.charCodeAt(i)) | 0;
  }

  let t = 0;
  let burst = 0; // keystrokes left in the current fast run
  for (let i = 0; i < text.length; i++) {
    if (burst <= 0 && hash01(seed + i * 7) > 0.87) {
      burst = 3 + Math.floor(hash01(seed + i * 13) * 4);
    }
    const factor =
      burst > 0
        ? 0.45 + hash01(seed + i * 5) * 0.2 // confident burst
        : 0.65 + hash01(seed + i * 3) * 0.75; // ordinary jittered key
    if (burst > 0) burst--;

    t += dt * factor;
    times[i] = t;

    const ch = text[i];
    if (ch === '\n') {
      t += linePause;
    } else {
      const rest = AFTER_PAUSE[ch];
      if (rest) t += dt * rest * (0.7 + hash01(seed + i * 11) * 0.6);
    }
  }
  return times;
}

/** Total time to type `text` including all pauses. */
export function typeDuration(text: string, speed: number, linePause = LINE_PAUSE): number {
  const s = typeSchedule(text, speed, linePause);
  return s.length ? s[s.length - 1] : 0;
}

/** How many characters have appeared by `local` seconds (schedule is monotonic). */
export function revealedCount(schedule: number[], local: number): number {
  let lo = 0;
  let hi = schedule.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (schedule[mid] <= local) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Human-typed reveal of `full` given previous buffer `prev`.
 * Uses typeSchedule; scales into `stepDur` when the natural duration is longer.
 * Returns absolute character index into `full`.
 */
export function typedRevealIndex(
  prev: string,
  full: string,
  stepLocal: number,
  stepDur: number,
  speed = 42,
): number {
  let cp = 0;
  const lim = Math.min(prev.length, full.length);
  while (cp < lim && prev[cp] === full[cp]) cp++;
  const delta = full.slice(cp);
  if (!delta.length) return full.length;
  if (stepLocal <= 0) return cp;
  const sched = typeSchedule(delta, Math.max(8, speed));
  const natural = sched.length ? sched[sched.length - 1] : 0.01;
  const fit = Math.max(stepDur * 0.88, 0.25);
  const scale = natural > fit ? natural / fit : 1;
  return cp + revealedCount(sched, stepLocal * scale);
}

/** Common prefix length between two strings. */
export function commonPrefixLen(a: string, b: string): number {
  let cp = 0;
  const lim = Math.min(a.length, b.length);
  while (cp < lim && a[cp] === b[cp]) cp++;
  return cp;
}
