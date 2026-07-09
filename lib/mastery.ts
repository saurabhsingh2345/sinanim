// The learner model (LEAP 3). A persistent, cross-lesson memory of what the
// learner knows — so the app can call back to concepts they struggled with and
// resurface them for review at the right time. Built on FSRS (Free Spaced
// Repetition Scheduler, the open-source algorithm that superseded SM-2 in Anki):
// each concept is a memory "card" with difficulty, stability and a due date,
// updated from how the learner performs on quizzes and challenges.
//
// Client-side, localStorage-backed (like lib/store.ts). No account, no server.

export type Grade = 1 | 2 | 3 | 4; // again | hard | good | easy

export interface Card {
  concept: string;
  /** FSRS difficulty (1..10) and stability (days). */
  difficulty: number;
  stability: number;
  /** ISO timestamps. */
  lastReview: number;
  due: number;
  reps: number;
  lapses: number;
}

// FSRS-6-style default weights (trimmed to the parts we use).
const W = {
  initStability: [0.4, 1.2, 3.2, 15.0], // by first grade (again..easy)
  initDifficulty: [7.2, 6.0, 4.9, 3.8],
  DECAY: -0.5,
  FACTOR: 19 / 81,
};
const DAY = 86_400_000;
const KEY = 'newani:mastery:v1';

function canStore() {
  return typeof window !== 'undefined' && !!window.localStorage;
}
function readAll(): Record<string, Card> {
  if (!canStore()) return {};
  try { return JSON.parse(window.localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function writeAll(cards: Record<string, Card>) {
  if (!canStore()) return;
  try { window.localStorage.setItem(KEY, JSON.stringify(cards)); } catch {}
}

const key = (c: string) => c.trim().toLowerCase();
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Retrievability now, given stability and days elapsed (FSRS forgetting curve). */
function retrievability(card: Card, at = Date.now()): number {
  const t = Math.max(0, (at - card.lastReview) / DAY);
  return Math.pow(1 + W.FACTOR * (t / Math.max(card.stability, 0.01)), W.DECAY);
}

/** Next stability. A lapse shrinks it; a good/easy review multiplies it (with a
 *  spacing bonus when retrievability had dropped) so durability grows over reps. */
function nextStability(card: Card, grade: Grade, r: number): number {
  if (grade === 1) return Math.max(0.3, card.stability * 0.5); // lapse
  const mult = grade === 2 ? 1.2 : grade === 3 ? 1.7 : 2.4; // hard | good | easy
  const spacing = 1 + (1 - r) * 0.6; // reviewing after some forgetting strengthens more
  const ease = 1 + (10 - card.difficulty) * 0.03;
  return card.stability * mult * spacing * ease;
}

function nextDifficulty(card: Card, grade: Grade): number {
  // easy pulls difficulty down, again pushes it up; drift toward the middle
  const delta = (3 - grade) * 0.6;
  return clamp(card.difficulty + delta - (card.difficulty - 5) * 0.05, 1, 10);
}

/** Record a review of `concept` and reschedule. Creates the card on first sight. */
export function recordReview(concept: string, grade: Grade): Card {
  if (!concept) return {} as Card;
  const cards = readAll();
  const id = key(concept);
  const now = Date.now();
  let card = cards[id];

  if (!card) {
    card = {
      concept: concept.trim(),
      difficulty: W.initDifficulty[grade - 1],
      stability: W.initStability[grade - 1],
      lastReview: now,
      due: now + Math.round(W.initStability[grade - 1] * DAY),
      reps: 1,
      lapses: grade === 1 ? 1 : 0,
    };
  } else {
    const r = retrievability(card, now);
    const stability = nextStability(card, grade, r);
    card = {
      ...card,
      difficulty: nextDifficulty(card, grade),
      stability,
      lastReview: now,
      due: now + Math.round(stability * DAY),
      reps: card.reps + 1,
      lapses: card.lapses + (grade === 1 ? 1 : 0),
    };
  }
  cards[id] = card;
  writeAll(cards);
  return card;
}

/** Convenience: a right/wrong result maps to good/again. */
export function recordResult(concept: string, correct: boolean): Card {
  return recordReview(concept, correct ? 3 : 1);
}

export function allCards(): Card[] {
  return Object.values(readAll());
}

/** Concepts whose predicted recall has decayed and are due for review. */
export function dueConcepts(at = Date.now()): Card[] {
  return allCards()
    .filter((c) => c.due <= at)
    .sort((a, b) => retrievability(a, at) - retrievability(b, at));
}

/** 0..1 mastery estimate. Driven by DURABILITY (how long the memory will hold),
 *  not just "you just saw it" — so a repeatedly-failed concept reads low even
 *  right after a review. Retrievability only tempers it as time passes. */
export function masteryOf(concept: string, at = Date.now()): number {
  const card = readAll()[key(concept)];
  if (!card) return 0;
  const durability = 1 - Math.pow(0.5, card.stability / 7); // ~0.5 at 1wk, ~0.85 at 3wk
  const r = retrievability(card, at);
  return clamp(durability * (0.6 + 0.4 * r), 0, 1);
}

/** Short human summary the lesson author can be told, e.g. to reinforce weak spots. */
export function weakConcepts(limit = 5): string[] {
  return allCards()
    .filter((c) => masteryOf(c.concept) < 0.6)
    .sort((a, b) => masteryOf(a.concept) - masteryOf(b.concept))
    .slice(0, limit)
    .map((c) => c.concept);
}
