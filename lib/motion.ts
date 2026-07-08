// Motion vocabulary shared by the camera, panels, and scene reveals.
// Everything here is a pure function of time so preview and export agree.

import { clamp, easeInOut } from './utils';

export function easeOutQuint(t: number): number {
  const x = clamp(t, 0, 1);
  return 1 - Math.pow(1 - x, 5);
}

export function easeOutExpo(t: number): number {
  const x = clamp(t, 0, 1);
  return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
}

/** Settles with one soft overshoot — for elements that "land" (cards, nodes). */
export function springOut(t: number): number {
  const x = clamp(t, 0, 1);
  if (x === 0 || x === 1) return x;
  return 1 + Math.pow(2, -9 * x) * Math.sin((x * 8 - 0.75) * (Math.PI / 1.7)) * 0.9;
}

/**
 * Smooth 0→1→0 window over [start, end]: eases up over `rise` seconds, holds,
 * then eases back down over `fall` seconds after `end`. The workhorse for
 * camera moves and overlay strengths that must be seek-safe.
 */
export function envelope(
  time: number,
  start: number,
  end: number,
  rise = 0.6,
  fall = 0.5,
): number {
  if (time < start || time > end + fall) return 0;
  const up = easeInOut(clamp((time - start) / Math.max(rise, 0.001), 0, 1));
  const down = easeInOut(clamp((end + fall - time) / Math.max(fall, 0.001), 0, 1));
  return Math.min(up, down);
}

/** Reveal progress for item `i` of a staggered list starting at `local` 0. */
export function staggerProgress(
  local: number,
  i: number,
  step = 0.5,
  rise = 0.45,
  delay = 0.15,
): number {
  return clamp((local - delay - i * step) / rise, 0, 1);
}
