// Server-only course generation: turning an outline/lesson into content requires
// the LLM pipeline (lib/llm.ts), which transitively pulls in node-only modules
// (@napi-rs/canvas for whiteboard vision QA). Keeping these functions OUT of
// lib/course.ts means the client-reachable course helpers (flattenLessons, the
// concept-DAG utilities, types) never drag the native canvas binding into the
// browser bundle. Only API routes import from here.

import { AnimationDSL } from './types';
import { chatJSON, generateDSL, GenerateOptions } from './llm';
import { extractJSON } from './dsl';
import {
  CourseOutline,
  conceptsBefore,
  flattenLessons,
  normalizeOutline,
  pruneDanglingPrereqs,
} from './course';

const OUTLINE_PROMPT = `You are a curriculum designer for short narrated video lessons.
Turn the user's topic into a compact course outline. Return JSON ONLY:

{
  "title": "Course title (short, concrete)",
  "description": "One friendly sentence on what the learner will be able to do.",
  "modules": [
    {
      "title": "Module title",
      "lessons": [
        {
          "title": "Lesson title",
          "objective": "One sentence: what the learner can DO after this lesson.",
          "focus": "Concrete instruction for the lesson author: exactly what to teach and demo, including which code example to build.",
          "concepts": ["1-3 short concept names this lesson INTRODUCES, e.g. \"list comprehensions\""],
          "prereqs": ["concept names taught in EARLIER lessons that this one builds on (exact same wording)"]
        }
      ]
    }
  ]
}

RULES:
- 2-3 modules, 2-3 lessons each (each lesson is a 1-3 minute video — keep scope tight).
- Lessons must build on each other in order; no forward references.
- "concepts" are the NEW ideas a lesson teaches; "prereqs" reference concepts from
  earlier lessons (use the EXACT same names so the dependency graph connects). The
  first lesson has no prereqs. This forms a concept DAG across the whole course.
- "focus" must name a specific, runnable example to build (not vague goals).
- Output ONLY the JSON object.`;

export async function generateCourseOutline(
  topic: string,
  opts: GenerateOptions = {},
): Promise<CourseOutline> {
  const content = await chatJSON(OUTLINE_PROMPT, `Design a course about: ${topic}`, opts);
  // Prune dangling prereqs so the cross-course concept DAG is always valid.
  return pruneDanglingPrereqs(normalizeOutline(JSON.parse(extractJSON(content)), topic));
}

/** Generate one lesson's timeline, telling the author where it sits in the course. */
export async function generateLessonDSL(
  outline: CourseOutline,
  lessonId: string,
  opts: GenerateOptions = {},
): Promise<AnimationDSL> {
  const all = flattenLessons(outline);
  const at = all.findIndex((e) => e.lesson.id === lessonId);
  if (at < 0) throw new Error(`Unknown lesson: ${lessonId}`);
  const entry = all[at];
  const prior = all.slice(0, at);

  // Cross-course concept DAG: what earlier lessons taught, what this one adds and
  // depends on. Feeds specificity (assume-known set) and seeds the recall opener.
  const known = conceptsBefore(outline, at);
  const introduces = entry.lesson.concepts || [];
  const prereqs = (entry.lesson.prereqs || []).filter(Boolean);
  // Recall targets: FSRS weak concepts if available, else this lesson's own
  // prerequisites — so even a first-time learner reviews the right prior concept.
  const recallTargets = opts.reviewConcepts?.length ? opts.reviewConcepts : prereqs;

  const context = [
    `This is lesson ${at + 1} of ${all.length} in the course "${outline.title}" (module: "${entry.moduleTitle}").`,
    prior.length
      ? `The learner has ALREADY covered: ${prior.map((p) => p.lesson.title).join('; ')}. Do not re-teach these — build on them.`
      : `This is the very first lesson — assume no prior knowledge of the topic.`,
    known.length ? `Concepts already taught (ASSUME KNOWN, reference freely): ${known.join(', ')}.` : '',
    introduces.length ? `New concepts THIS lesson introduces: ${introduces.join(', ')}.` : '',
    prereqs.length ? `This lesson builds directly on: ${prereqs.join(', ')} — connect back to them explicitly.` : '',
    `Lesson title: "${entry.lesson.title}".`,
    entry.lesson.objective ? `Objective: ${entry.lesson.objective}` : '',
    `Teach exactly this: ${entry.lesson.focus}`,
    // Spaced review: open a follow-up lesson with a "recall" reviewing a concept
    // the learner is weak on (FSRS) or a direct prerequisite (concept DAG).
    prior.length && recallTargets.length
      ? `OPEN the lesson with a "recall" scene reviewing ONE of these prior concepts: ${recallTargets.slice(0, 3).join(', ')} — pose a question, pause, then reveal the answer — before the title.`
      : '',
    `Include one quiz checkpoint. End by hinting at the next lesson${
      at + 1 < all.length ? ` ("${all[at + 1].lesson.title}")` : ' — or, as this is the last lesson, recap the whole course'
    }.`,
  ]
    .filter(Boolean)
    .join('\n');

  return generateDSL(context, opts);
}
