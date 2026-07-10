// Lesson planner — the stage where quality actually comes from.
//
// Research on long-form generation (STORM, Agents' Room, TheoremExplainAgent)
// is unambiguous: planning before writing is where organization, specificity
// and story live. The planner produces a small artifact the writer is then
// conditioned on: a concept dependency list, ONE named running example that
// evolves through the lesson, an instructor persona with opinions, and a beat
// sheet with explicit story slots (hook, misconception, payoff, callback).
// Generic `foo`/`bar` lessons die here, structurally.

import { chatJSON, GenerateOptions } from '../llm-core';

export type Register = 'fast' | 'calm';

export interface PlannedConcept {
  id: string;
  label: string;
  /** ids of concepts that must land first. */
  prereqs: string[];
  /** What learners typically get wrong — and why the wrong model feels right. */
  misconception: string;
}

export interface LessonBeat {
  /** Scene surface this beat should use (ide, viz, quiz, browser, ...). */
  surface: string;
  /** Story slot this beat fills. */
  slot: 'hook' | 'teach' | 'mistake' | 'why-not' | 'quiz' | 'practice' | 'recap';
  /** Concept being advanced. */
  conceptId?: string;
  /** One line of intent the writer must honor. */
  intent: string;
}

export interface LessonPlan {
  /** Instructor persona: a named voice with a point of view. */
  persona: { name: string; register: Register; voice: string };
  /** The one named example/product every code beat advances. */
  runningExample: { name: string; premise: string; language: string };
  concepts: PlannedConcept[];
  beats: LessonBeat[];
  /** A concrete moment from the opening that later beats call back to. */
  callback: string;
}

const PLANNER_PROMPT = `You are the showrunner for a short, narrated, interactive coding lesson.
You do NOT write the lesson — you write the PLAN a writer will be forced to follow. Return JSON only.

Produce:
{
  "persona": { "name": string, "register": "fast"|"calm", "voice": string },
  "runningExample": { "name": string, "premise": string, "language": string },
  "concepts": [ { "id": string, "label": string, "prereqs": [string], "misconception": string } ],
  "beats": [ { "surface": string, "slot": "hook"|"teach"|"mistake"|"why-not"|"quiz"|"practice"|"recap", "conceptId": string, "intent": string } ],
  "callback": string
}

RULES:
- persona.register: "fast" (dense, witty, Fireship-style) for topics an experienced dev grazes;
  "calm" (deliberate, intuition-first, 3Blue1Brown-style) for genuinely hard concepts.
  persona.voice: 1-2 sentences describing how they talk, including ONE opinion they hold about
  this topic (something a real practitioner would gripe about or love).
- runningExample: a NAMED, specific mini-product ("Brewlog — a coffee-tracking CLI", never
  "an example app"). Every code beat must advance THIS example. Real library names, plausible data.
- concepts: 2-5, smallest teachable units, prereqs form a DAG (no cycles). Each misconception
  must be a real learner mistake AND say why the wrong mental model feels right.
- beats: 6-12, in teaching order. MANDATORY structure:
  * beat 1 is slot "hook": a concrete failure, surprising output, or question — never a greeting.
  * at least one "mistake" beat: the naive/wrong version runs and visibly fails BEFORE the fix.
  * a "quiz" beat within 2-4 beats of each key concept (predict-the-output style when possible).
  * one "practice" beat near the end (a real coding challenge on the running example).
  * final beat is "recap" that resolves the hook.
  * surfaces: prefer "ide" for building, "viz" for algorithms/loops/data-structure motion,
    "browser"/"split" for web UI, "api" for HTTP, "cli" for tooling, "diagram" for architecture.
- callback: one concrete detail from the hook that later narration must reference by name.
- Respect the concept DAG: a beat may only use concepts whose prereqs appeared in earlier beats.
Return ONLY the JSON object.`;

/** Validate the plan enough to trust it; throw on structural nonsense. */
function normalizePlan(raw: any): LessonPlan {
  if (!raw || typeof raw !== 'object') throw new Error('plan is not an object');
  const concepts: PlannedConcept[] = (Array.isArray(raw.concepts) ? raw.concepts : [])
    .filter((c: any) => c && c.id)
    .map((c: any) => ({
      id: String(c.id),
      label: String(c.label ?? c.id),
      prereqs: Array.isArray(c.prereqs) ? c.prereqs.map(String) : [],
      misconception: String(c.misconception ?? ''),
    }));
  // DAG check: topological order must consume every concept
  const ids = new Set(concepts.map((c) => c.id));
  concepts.forEach((c) => { c.prereqs = c.prereqs.filter((p) => ids.has(p) && p !== c.id); });
  const placed = new Set<string>();
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const c of concepts) {
      if (!placed.has(c.id) && c.prereqs.every((p) => placed.has(p))) {
        placed.add(c.id);
        progressed = true;
      }
    }
  }
  if (placed.size !== concepts.length) throw new Error('concept prerequisites contain a cycle');

  const beats: LessonBeat[] = (Array.isArray(raw.beats) ? raw.beats : [])
    .filter((b: any) => b && b.surface && b.slot)
    .map((b: any) => ({
      surface: String(b.surface),
      slot: b.slot,
      conceptId: b.conceptId ? String(b.conceptId) : undefined,
      intent: String(b.intent ?? ''),
    }));
  if (beats.length < 4) throw new Error('plan has too few beats');
  if (beats[0].slot !== 'hook') beats[0].slot = 'hook';

  return {
    persona: {
      name: String(raw.persona?.name ?? 'the instructor'),
      register: raw.persona?.register === 'calm' ? 'calm' : 'fast',
      voice: String(raw.persona?.voice ?? ''),
    },
    runningExample: {
      name: String(raw.runningExample?.name ?? ''),
      premise: String(raw.runningExample?.premise ?? ''),
      language: String(raw.runningExample?.language ?? 'python'),
    },
    concepts,
    beats,
    callback: String(raw.callback ?? ''),
  };
}

export async function planLesson(
  prompt: string,
  opts: GenerateOptions = {},
): Promise<LessonPlan> {
  const { extractJSON } = await import('../dsl');
  let lastErr: unknown;
  for (let tries = 0; tries < 2; tries++) {
    try {
      const content = await chatJSON(PLANNER_PROMPT, `Plan a lesson for: ${prompt}`, opts);
      return normalizePlan(JSON.parse(extractJSON(content)));
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/** The plan, rendered as a hard contract for the lesson writer. */
export function planPromptBlock(plan: LessonPlan): string {
  const conceptLines = plan.concepts
    .map((c) => `  - ${c.id} ("${c.label}")${c.prereqs.length ? ` after ${c.prereqs.join(', ')}` : ''} · misconception to confront: ${c.misconception}`)
    .join('\n');
  const beatLines = plan.beats
    .map((b, i) => `  ${i + 1}. [${b.slot}] ${b.surface}${b.conceptId ? ` (${b.conceptId})` : ''} — ${b.intent}`)
    .join('\n');
  return `THE PLAN (a contract — follow every beat, in order):
PERSONA: ${plan.persona.name}, register "${plan.persona.register}". ${plan.persona.voice}
Write ALL narration in this persona's voice, opinions included.
RUNNING EXAMPLE: ${plan.runningExample.name} — ${plan.runningExample.premise} (${plan.runningExample.language}).
Every code beat advances THIS example. Never introduce foo/bar or an unrelated snippet.
CONCEPTS (respect prerequisite order):
${conceptLines}
BEAT SHEET (one scene per beat, same order; surfaces are binding):
${beatLines}
CALLBACK: later narration must explicitly reference: ${plan.callback}
REGISTER RULES: "fast" → 2-3 minute lesson, dense, dry wit, cuts fast. "calm" → 4-6 minutes,
deliberate pauses (beat scenes), intuition before formalism, one idea per scene.`;
}
