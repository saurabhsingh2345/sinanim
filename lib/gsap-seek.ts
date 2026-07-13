// GSAP as a *deterministic, seekable* choreography engine — never as a live
// RAF animator. We build a paused timeline that tweens plain JS state objects
// (no DOM), then `seek(t)` to read the animated values back and draw them on the
// canvas ourselves. Because a paused timeline is a pure function of its playhead,
// the same `t` always yields the same state → preview and export agree, and
// headless (@napi-rs/canvas) renders identically to the browser.
//
// Use this for multi-target choreography (staggers, springs, overlapping tweens)
// where hand-rolling the math in motion.ts would be tedious. For simple single
// eases, prefer the pure functions in ./motion (cheaper, no object churn).

import { gsap } from 'gsap';

export type SeekState = Record<string, number>;

export interface ChoreoStep<S extends SeekState> {
  /** target keys → end values */
  to: Partial<S>;
  duration: number;
  /** gsap ease string, e.g. 'back.out(1.7)', 'elastic.out(1,0.4)', 'power3.out' */
  ease?: string;
  /** absolute start time on the timeline, or gsap position token like '<', '+=0.1' */
  at?: number | string;
  /** stagger when `to` is applied across an array of sub-targets (advanced) */
  stagger?: number;
}

/**
 * A reusable, paused choreography. Build once (cache on the prepared scene),
 * then call `.at(t)` each frame to get the interpolated state. Rebuilding every
 * frame would be wasteful and — because GSAP mutates in place — we snapshot.
 */
export class Choreo<S extends SeekState> {
  private tl: gsap.core.Timeline;
  private state: S;
  private initial: S;

  private keys: (keyof S)[];

  constructor(initial: S) {
    this.initial = { ...initial };
    this.state = { ...initial };
    this.keys = Object.keys(initial) as (keyof S)[];
    this.tl = gsap.timeline({ paused: true });
  }

  step(step: ChoreoStep<S>): this {
    this.tl.to(
      this.state,
      { ...step.to, duration: step.duration, ease: step.ease ?? 'power2.out' } as gsap.TweenVars,
      step.at as gsap.Position,
    );
    return this;
  }

  /** total timeline duration in seconds */
  get duration(): number {
    return this.tl.duration();
  }

  /** Seek to `t` seconds and return a snapshot of the animated state. */
  at(t: number): S {
    this.tl.seek(Math.max(0, t), false);
    // GSAP tags the target with a `_gsap` cache; copy only the declared keys so
    // callers get a clean, serializable numeric snapshot.
    const out = {} as S;
    for (const k of this.keys) out[k] = this.state[k];
    return out;
  }
}

/** Convenience: build a Choreo from an initial state and a list of steps. */
export function choreo<S extends SeekState>(initial: S, steps: ChoreoStep<S>[]): Choreo<S> {
  const c = new Choreo(initial);
  for (const s of steps) c.step(s);
  return c;
}
