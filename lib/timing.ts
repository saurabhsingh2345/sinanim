// Human-like typing schedule. Typing is not machine-uniform: after each line the
// typist pauses briefly before the next line. We precompute, for a block of text,
// the exact time each character appears (relative to the scene start). The renderer
// and the sound Conductor both consume this so visuals and key clicks stay in sync.

export const LINE_PAUSE = 0.4; // seconds of rest after each newline

/** Reveal time (s, relative to scene start) for each character index in `text`. */
export function typeSchedule(
  text: string,
  speed: number,
  linePause = LINE_PAUSE,
): number[] {
  const times = new Array<number>(text.length);
  const dt = speed > 0 ? 1 / speed : 0;
  let t = 0;
  for (let i = 0; i < text.length; i++) {
    t += dt;
    times[i] = t;
    if (text[i] === '\n') t += linePause; // rest after finishing the line
  }
  return times;
}

/** Total time to type `text` including the per-line pauses. */
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
