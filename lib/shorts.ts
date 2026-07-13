// 9:16 "shorts" auto-crop (MASTERPLAN Pillar F.5). Take a finished 16:9 lesson
// and derive a punchy vertical teaser from its HOOK (opening) + PAYOFF (a
// memorable result) scenes, re-laid at 1080×1920. The renderer is width-aware,
// so the same card code reflows to portrait — we just pick the right beats and
// avoid landscape-heavy surfaces (ide/browser/split/layout) that don't reflow.
import { AnimationDSL, Scene } from './types';
import { repace } from './dsl';

/** Card types that read well in a narrow portrait frame. */
const VERTICAL_FRIENDLY = new Set([
  'title', 'bullets', 'bigstat', 'quote', 'cheatsheet', 'recall', 'quiz', 'diagram',
]);

export interface ShortsOptions {
  /** Hard cap on the teaser length (seconds). Default 45. */
  maxSeconds?: number;
}

/** Derive a vertical (1080×1920) teaser DSL from a full lesson. */
export function toShorts(dsl: AnimationDSL, opts: ShortsOptions = {}): AnimationDSL {
  const maxSeconds = opts.maxSeconds ?? 45;
  const primaries = dsl.scenes.filter((s) => VERTICAL_FRIENDLY.has(s.type));

  const first = (t: string) => primaries.find((s) => s.type === t);
  const last = (t: string) => [...primaries].reverse().find((s) => s.type === t);

  // Hook: the opening title (or the first card that reflows).
  const hook = first('title') ?? primaries[0];
  // Payoff: the most "screenshot-worthy" closer available.
  const payoff =
    last('cheatsheet') ?? last('bigstat') ?? last('quote') ?? last('quiz');
  // One middle beat that adds substance without a landscape surface.
  const middle = primaries.find(
    (s) => s !== hook && s !== payoff && (s.type === 'bullets' || s.type === 'recall' || s.type === 'bigstat'),
  );

  const chosen: Scene[] = [];
  for (const s of [hook, middle, payoff]) if (s && !chosen.includes(s)) chosen.push(s);
  // Fallback: not enough distinct beats — take the first few friendly cards.
  if (chosen.length < 2) {
    for (const s of primaries) {
      if (!chosen.includes(s)) chosen.push(s);
      if (chosen.length >= 3) break;
    }
  }

  // Clone, retime sequentially, and trim to the cap. repace() re-derives the
  // final startTimes; this pass just orders them and enforces the budget.
  const scenes: Scene[] = [];
  let t = 0;
  for (const s of chosen) {
    if (t >= maxSeconds) break;
    scenes.push({ ...s, startTime: t, transition: 'fade' } as Scene);
    t += Math.max(s.duration, 2) + 0.3;
  }

  return repace({
    ...dsl,
    title: `${dsl.title} — short`,
    width: 1080,
    height: 1920,
    scenes,
  });
}
