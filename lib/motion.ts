// Motion vocabulary shared by the camera, panels, and scene reveals.
// Everything here is a pure function of time so preview and export agree.

import { clamp, easeInOut, easeOutCubic } from './utils';

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

/**
 * Like `envelope`, but the rise overshoots slightly (easeOutBack) so a camera
 * push-in or badge arrival has a bit of momentum before it settles. The
 * returned strength can briefly exceed 1 during the overshoot — callers that
 * lerp toward a target will glide a touch past it, then ease back.
 */
export function envelopeBack(
  time: number,
  start: number,
  end: number,
  rise = 0.6,
  fall = 0.5,
  over = 1.4,
): number {
  if (time < start || time > end + fall) return 0;
  const up = easeOutBackRaw(clamp((time - start) / Math.max(rise, 0.001), 0, 1), over);
  const down = easeInOut(clamp((end + fall - time) / Math.max(fall, 0.001), 0, 1));
  return Math.min(up, down);
}

// local back-out (kept internal so envelopeBack doesn't depend on export order)
function easeOutBackRaw(x: number, over: number): number {
  const c3 = over + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + over * Math.pow(x - 1, 2);
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

// ─────────────────────────────────────────────────────────────────────────────
// Extended easing vocabulary. Every function is a pure `f(t∈[0,1]) → number`,
// deterministic and seek-safe, so preview and export always agree.
// ─────────────────────────────────────────────────────────────────────────────

export function easeInExpo(t: number): number {
  const x = clamp(t, 0, 1);
  return x === 0 ? 0 : Math.pow(2, 10 * x - 10);
}

export function easeInOutExpo(t: number): number {
  const x = clamp(t, 0, 1);
  if (x === 0 || x === 1) return x;
  return x < 0.5
    ? Math.pow(2, 20 * x - 10) / 2
    : (2 - Math.pow(2, -20 * x + 10)) / 2;
}

export function easeInOutQuint(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 16 * x * x * x * x * x : 1 - Math.pow(-2 * x + 2, 5) / 2;
}

export function easeInBack(t: number, overshoot = 1.70158): number {
  const x = clamp(t, 0, 1);
  const c3 = overshoot + 1;
  return c3 * x * x * x - overshoot * x * x;
}

/** Back-out with a tunable overshoot (1.70158 ≈ 10% past, higher = punchier). */
export function easeOutBack(t: number, overshoot = 1.70158): number {
  const x = clamp(t, 0, 1);
  const c3 = overshoot + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + overshoot * Math.pow(x - 1, 2);
}

export function easeInOutBack(t: number, overshoot = 1.70158): number {
  const x = clamp(t, 0, 1);
  const c2 = overshoot * 1.525;
  return x < 0.5
    ? (Math.pow(2 * x, 2) * ((c2 + 1) * 2 * x - c2)) / 2
    : (Math.pow(2 * x - 2, 2) * ((c2 + 1) * (x * 2 - 2) + c2) + 2) / 2;
}

export function easeOutBounce(t: number): number {
  let x = clamp(t, 0, 1);
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}

export function easeInElastic(t: number): number {
  const x = clamp(t, 0, 1);
  if (x === 0 || x === 1) return x;
  const c4 = (2 * Math.PI) / 3;
  return -Math.pow(2, 10 * x - 10) * Math.sin((x * 10 - 10.75) * c4);
}

/**
 * Analytic under-damped spring settling 0→1 over its natural duration, sampled
 * at normalized time `t∈[0,1]`. Fully closed-form (no integration), so it is
 * deterministic and identical every render. Higher `stiffness` = faster snap;
 * higher `damping` = fewer bounces. This is the physical companion to the
 * kinematic `springOut` above — prefer this when you want to tune the feel.
 */
export function springValue(
  t: number,
  { stiffness = 170, damping = 12, mass = 1 }: { stiffness?: number; damping?: number; mass?: number } = {},
): number {
  const x = clamp(t, 0, 1);
  if (x === 0) return 0;
  if (x === 1) return 1;
  const w0 = Math.sqrt(stiffness / mass); // undamped angular frequency
  const zeta = clamp(damping / (2 * Math.sqrt(stiffness * mass)), 0.05, 4); // damping ratio
  // Map normalized [0,1] onto the spring's natural settle window so the motion
  // fills the element's own duration regardless of stiffness/damping. We stretch
  // time so that at x=1 the envelope has decayed to ~e^-5 (visually at rest).
  const decayRate = zeta < 1 ? zeta * w0 : w0;
  const tau = x * (5 / decayRate);
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const env = Math.exp(-zeta * w0 * tau);
    return 1 - env * (Math.cos(wd * tau) + ((zeta * w0) / wd) * Math.sin(wd * tau));
  }
  // critically / over-damped: monotonic approach, no overshoot
  const env = Math.exp(-w0 * tau);
  return 1 - env * (1 + w0 * tau);
}

/**
 * Cubic-bézier timing function `f(t)` matching CSS `cubic-bezier(x1,y1,x2,y2)`.
 * Solves x(t)→t via a few Newton-Raphson steps (deterministic, ~1e-6 accurate).
 * Returns a reusable pure function so callers can cache it per-scene.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (input: number) => {
    const x = clamp(input, 0, 1);
    let t = x;
    for (let i = 0; i < 5; i++) {
      const dx = sampleX(t) - x;
      const d = slopeX(t);
      if (Math.abs(dx) < 1e-6 || Math.abs(d) < 1e-6) break;
      t -= dx / d;
    }
    return sampleY(clamp(t, 0, 1));
  };
}

/** Rise past `peak` then settle to 1 — a gentle "arrival" pop for numbers/badges. */
export function overshoot(t: number, peak = 1.12): number {
  const x = clamp(t, 0, 1);
  const base = easeOutCubic(x);
  const bump = Math.sin(x * Math.PI) * (peak - 1) * Math.pow(1 - x, 0.5);
  return base + bump;
}

/**
 * Nonlinear stagger: early items in a large list arrive quickly, later items
 * ease apart, so a 30-line block doesn't machine-gun and a 3-line block doesn't
 * crawl. Returns the reveal progress [0,1] for item `i` of `count`.
 */
export function staggerCurve(
  local: number,
  i: number,
  count: number,
  windowSec: number,
  rise = 0.34,
  curve = 0.7,
): number {
  const n = Math.max(count, 1);
  // normalized start position, biased so later items compress toward the end
  const frac = n === 1 ? 0 : Math.pow(i / (n - 1), curve);
  const start = frac * Math.max(windowSec - rise, 0);
  return clamp((local - start) / rise, 0, 1);
}

// re-export the shared kinematic eases so motion.ts is the single motion entry.
export { easeInOut, easeOutCubic, easeInCubic, easeOutElastic } from './utils';
