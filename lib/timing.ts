// Human-like typing schedule. Typing is not machine-uniform: keystrokes jitter,
// the typist rests after punctuation, occasionally rattles off a familiar burst,
// and pauses before starting the next line. We precompute, for a block of text,
// the exact time each character appears (relative to the scene start). The renderer
// and the sound Conductor both consume this so visuals and key clicks stay in sync.
// Everything is deterministic (seeded from the text) so export matches preview.

import { hash01 } from './utils';
import { diffLines } from './diff';

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

/**
 * Line-aware typed reveal. The old `typedRevealIndex` did a *character* common
 * prefix: any snapshot that changed or inserted anything above the end re-typed
 * the whole tail — which read as "erase the bottom and rewrite it from line one".
 *
 * Instead we diff by LINE. Lines carried over from `prev` are shown immediately
 * (static context, above AND below); only genuinely-new lines are typed, in
 * their real positions and document order. Appending code types top-to-bottom
 * as before; inserting a line mid-file types just that line in place.
 */
export interface TypeReveal {
  /** Visible char count per line of `full`. MAX_SAFE_INTEGER = fully shown. */
  perLine: number[];
  /** Index (into `full`'s lines) of the line the caret is on. */
  caretLine: number;
  /** Column (chars) of the caret on that line. */
  caretCol: number;
  /** Chars of genuinely-new text revealed so far (drives keystroke SFX). */
  typedNew: number;
  /** Total new chars this step will type. */
  totalNew: number;
}

const MAXV = Number.MAX_SAFE_INTEGER;

export function typedReveal(
  prev: string,
  full: string,
  stepLocal: number,
  stepDur: number,
  speed = 26,
): TypeReveal {
  const fullLines = full.length ? full.split('\n') : [''];
  // Which lines of `full` are new (must be typed) vs. carried over from `prev`.
  const diff = diffLines(prev, full);
  const isNew: boolean[] = [];
  for (const d of diff) {
    if (d.kind === 'removed') continue; // removed lines aren't in `full`
    isNew.push(d.kind === 'added');
  }
  // Keep the map aligned with fullLines even if the diff walk disagrees.
  while (isNew.length < fullLines.length) isNew.push(true);
  if (isNew.length > fullLines.length) isNew.length = fullLines.length;

  const newIdx: number[] = [];
  for (let i = 0; i < fullLines.length; i++) if (isNew[i]) newIdx.push(i);

  // Kept lines fully visible; new lines start hidden and fill in as typed.
  const perLine = fullLines.map((_, i) => (isNew[i] ? 0 : MAXV));
  const totalNew =
    newIdx.reduce((a, i) => a + fullLines[i].length, 0) + Math.max(0, newIdx.length - 1);

  if (!newIdx.length) {
    const lastLine = fullLines.length - 1;
    return { perLine, caretLine: lastLine, caretCol: fullLines[lastLine].length, typedNew: 0, totalNew: 0 };
  }

  const typedText = newIdx.map((i) => fullLines[i]).join('\n');
  const sched = typeSchedule(typedText, Math.max(8, speed));
  const natural = sched.length ? sched[sched.length - 1] : 0.01;
  const fit = Math.max(stepDur * 0.88, 0.25);
  const scale = natural > fit ? natural / fit : 1;
  const revealed = stepLocal <= 0 ? 0 : revealedCount(sched, stepLocal * scale);

  let remaining = revealed;
  let caretLine = newIdx[0];
  let caretCol = 0;
  for (let n = 0; n < newIdx.length; n++) {
    const li = newIdx[n];
    const len = fullLines[li].length;
    if (remaining >= len) {
      perLine[li] = len;
      caretLine = li; caretCol = len;
      remaining -= len;
      if (n < newIdx.length - 1) remaining -= 1; // the newline joining new lines
      if (remaining <= 0) { remaining = 0; break; }
    } else {
      perLine[li] = remaining;
      caretLine = li; caretCol = remaining;
      remaining = 0;
      break;
    }
  }
  return { perLine, caretLine, caretCol, typedNew: revealed, totalNew };
}

/** Common prefix length between two strings. */
export function commonPrefixLen(a: string, b: string): number {
  let cp = 0;
  const lim = Math.min(a.length, b.length);
  while (cp < lim && a[cp] === b[cp]) cp++;
  return cp;
}
