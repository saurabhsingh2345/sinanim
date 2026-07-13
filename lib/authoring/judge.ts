// Lesson judge — the accept/reject gate between authoring passes.
//
// LLMs prefer their own rewrites even when they're worse (self-bias), so a
// revision is only accepted if a separate judge call says it beats the
// previous version (Refine-n-Judge). The rubric is a BINARY checklist —
// yes/no questions are reproducible where 1-10 scores are noise — and it
// mirrors the same pedagogy rules the writer was given, so generation and
// evaluation pull in the same direction.

import { AnimationDSL } from '../types';
import { chatJSON, GenerateOptions } from '../llm-core';
import { spokenNarration } from '../step-sync';

export interface JudgeVerdict {
  /** Checklist item -> pass/fail. */
  checks: Record<string, boolean>;
  /** 0..1 share of checks passed. */
  score: number;
  /** Judge's one-line note per failed check. */
  notes: string[];
}

const CHECKLIST = [
  'hook_first_5s: the first narrated sentence is a concrete problem, surprising output, or question — not a greeting or agenda',
  'running_example: the code beats advance one named, specific example (not foo/bar or disconnected snippets)',
  'misconception_confronted: at least one beat shows a wrong/naive version and explains why the wrong mental model feels right',
  'reasoning_narration: narration explains WHY (mechanism/consequences) rather than reading the code aloud',
  'quiz_placed: a quiz checkpoint sits within a few scenes of the key concept, with plausible distractors',
  'callback_present: later narration references a concrete detail from the opening',
  'spoken_register: narration uses contractions, varied sentence lengths, direct address — it reads as speech',
  'complete_arc: the lesson opens with motivation, teaches, practices, and the recap resolves the opening',
];

const JUDGE_PROMPT = `You are a strict lesson reviewer. You will receive the JSON of an animated,
narrated coding lesson. Evaluate it against a fixed binary checklist. Return JSON only:
{ "checks": { "<check_id>": true|false, ... }, "notes": ["<check_id>: one-line reason for each false"] }

CHECKLIST:
${CHECKLIST.map((c) => `- ${c}`).join('\n')}

Judge ONLY what is in the JSON. Be harsh: a check passes only when clearly satisfied.`;

/** Slim the DSL for judging: narration + structure, not full code payloads. */
function judgeView(dsl: AnimationDSL): string {
  return JSON.stringify({
    title: dsl.title,
    scenes: dsl.scenes.map((s) => ({
      type: s.type,
      narration: spokenNarration(s),
      ...(s.type === 'quiz' ? { question: s.question, options: s.options } : {}),
      ...(s.type === 'challenge' ? { prompt: s.prompt } : {}),
      ...(s.type === 'ide'
        ? { steps: s.steps.map((st) => st.action.kind), project: s.project }
        : {}),
      ...('title' in s && typeof (s as any).title === 'string' ? { sceneTitle: (s as any).title } : {}),
    })),
  });
}

export async function judgeLesson(
  dsl: AnimationDSL,
  opts: GenerateOptions = {},
): Promise<JudgeVerdict> {
  const { extractJSON } = await import('../dsl');
  const content = await chatJSON(JUDGE_PROMPT, `Lesson JSON:\n${judgeView(dsl)}`, opts);
  const raw = JSON.parse(extractJSON(content));
  const checks: Record<string, boolean> = {};
  for (const line of CHECKLIST) {
    const id = line.split(':')[0];
    checks[id] = raw?.checks?.[id] === true;
  }
  const passed = Object.values(checks).filter(Boolean).length;
  return {
    checks,
    score: passed / CHECKLIST.length,
    notes: Array.isArray(raw?.notes) ? raw.notes.map(String).slice(0, 8) : [],
  };
}

/**
 * Refine-n-Judge gate: keep the revision only when it scores at least as well
 * as the original. Any judge failure keeps the original (never block on QA).
 */
export async function pickBetter(
  original: AnimationDSL,
  revision: AnimationDSL,
  opts: GenerateOptions = {},
): Promise<{ dsl: AnimationDSL; verdict?: JudgeVerdict }> {
  try {
    const [a, b] = await Promise.all([
      judgeLesson(original, opts),
      judgeLesson(revision, opts),
    ]);
    return b.score >= a.score ? { dsl: revision, verdict: b } : { dsl: original, verdict: a };
  } catch {
    return { dsl: revision }; // judge unavailable — trust the editor pass as before
  }
}
