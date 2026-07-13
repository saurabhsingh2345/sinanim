// Deterministic randomness for motion: seeded PRNG + value noise, plus the
// derived effects (screen-shake, grain jitter) that must look organic yet render
// byte-identically every time. Never use Math.random() in the render path — it
// would desync preview and export. All helpers here are pure `f(seed[, t])`.

import { createNoise2D } from 'simplex-noise';

/** mulberry32 — tiny, fast, well-distributed PRNG. Returns a stateful sampler. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One-shot deterministic value in [0,1) from any integer key (no state). */
export function rand01(n: number): number {
  let t = (n ^ 0x9e3779b9) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x45d9f3b);
  t = Math.imul(t ^ (t >>> 16), 0x45d9f3b);
  t = (t ^ (t >>> 16)) >>> 0;
  return t / 4294967296;
}

/** Deterministic value in [min,max] from a key. */
export function randRange(n: number, min: number, max: number): number {
  return min + rand01(n) * (max - min);
}

// A small pool of fixed-seed simplex fields. Building a noise field allocates,
// so we memoize per integer seed and reuse across frames.
const noiseCache = new Map<number, (x: number, y: number) => number>();
export function noiseField(seed: number): (x: number, y: number) => number {
  let f = noiseCache.get(seed);
  if (!f) {
    const rng = mulberry32(seed || 1);
    f = createNoise2D(rng);
    noiseCache.set(seed, f);
  }
  return f;
}

/** Smooth 1-D noise in [-1,1] sampled along a seeded field at position `x`. */
export function noise1D(seed: number, x: number): number {
  return noiseField(seed)(x, seed * 0.123);
}

export interface ShakeOffset {
  dx: number;
  dy: number;
  rot: number;
}

/**
 * Damped, seek-safe screen shake. `t` is seconds since the shake started;
 * amplitude decays exponentially so the frame settles. Driven by two smooth
 * noise fields (not white noise) so it feels like a physical jolt, not static.
 */
export function shakeAt(
  t: number,
  seed: number,
  amplitude = 14,
  duration = 0.5,
  freq = 22,
): ShakeOffset {
  if (t <= 0 || t >= duration) return { dx: 0, dy: 0, rot: 0 };
  const decay = Math.exp(-4.5 * (t / duration));
  const a = amplitude * decay;
  const nx = noiseField(seed);
  const ny = noiseField(seed + 977);
  return {
    dx: nx(t * freq, 0) * a,
    dy: ny(t * freq, 0) * a,
    rot: nx(t * freq * 0.5, 7) * (a / amplitude) * 0.012,
  };
}
