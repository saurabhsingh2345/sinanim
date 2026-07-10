// Narration script lint — the "does this sound like a human?" gate.
//
// Learners clock AI-written narration within a paragraph: the giveaway is not
// the voice model, it's the script (filler phrases, uniform sentence rhythm,
// no contractions, symbols read out loud). These checks are deterministic and
// cheap, so they run on every generation; offending sentences are sent back to
// the LLM for a *targeted* rewrite instead of regenerating the whole lesson.

import { AnimationDSL } from './types';

export interface ScriptIssue {
  sceneIndex: number;
  kind: 'phrase' | 'rhythm' | 'contraction' | 'symbol' | 'opener';
  /** The offending sentence (or phrase) verbatim. */
  excerpt: string;
  message: string;
}

/** Phrases that read as AI slop or dead-air filler — banned in narration. */
const FORBIDDEN: { re: RegExp; label: string }[] = [
  { re: /\bdelve\b/i, label: '"delve"' },
  { re: /\bdive (in|into|deep)\b/i, label: '"dive into"' },
  { re: /\bdeep dive\b/i, label: '"deep dive"' },
  { re: /\bin this (video|lesson|tutorial)\b/i, label: '"in this video/lesson"' },
  { re: /\bwelcome (back|to)\b/i, label: '"welcome to/back"' },
  { re: /\bin today'?s\b/i, label: '"in today\'s"' },
  { re: /\bit'?s (important|worth) (to note|noting)\b/i, label: '"it\'s important to note"' },
  { re: /\bwithout further ado\b/i, label: '"without further ado"' },
  { re: /\blet'?s get started\b/i, label: '"let\'s get started"' },
  { re: /\bbuckle up\b/i, label: '"buckle up"' },
  { re: /\bseamless(ly)?\b/i, label: '"seamless"' },
  { re: /\bleverage\b/i, label: '"leverage"' },
  { re: /\bunlock(ing)? the (power|potential)\b/i, label: '"unlock the power"' },
  { re: /\bgame.?changer\b/i, label: '"game-changer"' },
  { re: /\brevolutioniz/i, label: '"revolutionize"' },
  { re: /\bmaster the art\b/i, label: '"master the art"' },
  { re: /\bin the (realm|world) of\b/i, label: '"in the realm of"' },
  { re: /\bfast-paced (world|environment)\b/i, label: '"fast-paced world"' },
  { re: /\bin conclusion\b/i, label: '"in conclusion"' },
  { re: /^\s*(furthermore|moreover|additionally)\b/i, label: 'essay-opener ("furthermore/moreover")' },
];

/** Code symbols that a TTS voice would read as garbage. */
const SYMBOLS = /(=>|==|!=|<=|>=|\+\+|--|&&|\|\||[{}<>]|::|\bhttps?:\/\/)/;

/** Wordy pairs that contractions would make sound spoken, not written. */
const UNCONTRACTED = /\b(do not|does not|did not|is not|are not|was not|cannot|can not|will not|would not|should not|it is|that is|there is|we are|you are|they are|we will|you will|let us)\b/gi;

function sentencesOf(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [])
    .map((s) => s.trim())
    .filter(Boolean);
}

const wordsOf = (s: string) => s.split(/\s+/).filter(Boolean);

/** All narration problems in one pass. */
export function lintScript(dsl: AnimationDSL): ScriptIssue[] {
  const issues: ScriptIssue[] = [];

  dsl.scenes.forEach((scene, sceneIndex) => {
    const n = scene.narration;
    if (!n) return;
    const sentences = sentencesOf(n);

    for (const s of sentences) {
      for (const f of FORBIDDEN) {
        if (f.re.test(s)) {
          issues.push({
            sceneIndex, kind: 'phrase', excerpt: s,
            message: `contains ${f.label} — rewrite plainly, say something specific instead`,
          });
          break; // one phrase issue per sentence is enough signal
        }
      }
      if (SYMBOLS.test(s)) {
        issues.push({
          sceneIndex, kind: 'symbol', excerpt: s,
          message: 'contains code symbols/URL the voice would read out — describe it the way you\'d SAY it',
        });
      }
    }

    // uniform rhythm: 4+ sentences all within a narrow word-count band reads robotic
    if (sentences.length >= 4) {
      const lens = sentences.map((s) => wordsOf(s).length);
      const min = Math.min(...lens);
      const max = Math.max(...lens);
      if (max - min <= 4 && min >= 8) {
        issues.push({
          sceneIndex, kind: 'rhythm', excerpt: sentences[0],
          message: `all ${sentences.length} sentences are ${min}-${max} words — vary the rhythm (one short punchy sentence, one longer one)`,
        });
      }
    }

    // written register: several uncontracted pairs and zero contractions
    const uncontracted = n.match(UNCONTRACTED)?.length || 0;
    const contracted = (n.match(/\b\w+'(s|re|ve|ll|t|d|m)\b/gi) || []).length;
    if (uncontracted >= 2 && contracted === 0) {
      issues.push({
        sceneIndex, kind: 'contraction', excerpt: sentences[0] || n.slice(0, 80),
        message: 'no contractions — this reads like an essay, not speech ("it is" → "it\'s", "do not" → "don\'t")',
      });
    }
  });

  // trailer-style opener ("In this video we will learn...") on the first narrated scene
  const first = dsl.scenes.find((s) => s.narration);
  if (first?.narration && /^(in this|today (we|I)|welcome|hello|hi\b)/i.test(first.narration.trim())) {
    issues.push({
      sceneIndex: dsl.scenes.indexOf(first), kind: 'opener',
      excerpt: sentencesOf(first.narration)[0] || '',
      message: 'opens with a greeting/announcement — open with the HOOK instead (a concrete problem, a surprising failure, a question)',
    });
  }

  return issues;
}

/** Human/LLM-readable report for a targeted rewrite request. */
export function lintReport(issues: ScriptIssue[]): string {
  return issues
    .map((i) => `- scene ${i.sceneIndex} (${i.kind}): ${i.message}\n  offending: "${i.excerpt}"`)
    .join('\n');
}

/** The spoken-style contract injected into every narration-writing prompt. */
export const SPOKEN_STYLE_RULES = `
VOICE & DELIVERY (the narration is synthesized to real speech — write for the EAR):
- Write like a sharp friend explaining over coffee, not a textbook. Use contractions everywhere
  ("it's", "don't", "we're"). Address the learner as "you". Have opinions ("this API name is
  awful, but here's why it works").
- VARY sentence length hard: after any sentence over 15 words, follow with one under 8.
  Short sentences land. Use them.
- Ask a rhetorical question before a reveal, then answer it. ("So what does this print? Nothing.
  And that's the bug.")
- Deliberate pauses: use an ellipsis … before a punchline or reveal; end big moments with a
  short sentence. Insert a {"type":"beat","duration":0.8} scene after a major reveal instead of
  rushing on.
- Open the LESSON with a hook in the first sentence: a concrete failure, a surprising output, or
  a question the learner has actually had. NEVER open with "In this video", "Welcome", or
  "Today we'll learn".
- BANNED words/phrases (instant rewrite): delve, dive into, deep dive, leverage, seamless,
  unlock the power, game-changer, revolutionize, master the art, in the realm of, in today's
  fast-paced world, it's important to note, without further ado, in conclusion, furthermore,
  moreover as sentence openers.
- Never speak symbols: say "arrow function" not "=>", "double equals" not "==", "dot map" not
  ".map", spell numbers under twenty as words. No URLs in narration.
- Callbacks: reference something from an earlier scene at least twice per lesson ("remember the
  crash from the start? This line is why it happened.").`;
