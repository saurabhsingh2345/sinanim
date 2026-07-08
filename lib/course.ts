// Course engine: a prompt becomes a course outline (modules → lessons), and each
// lesson becomes an AnimationDSL on demand — generated with context about what
// earlier lessons already covered, so the course actually builds on itself.

import { AnimationDSL } from './types';
import { chatJSON, generateDSL, GenerateOptions } from './llm';
import { extractJSON } from './dsl';

export interface LessonRef {
  id: string;
  title: string;
  /** One sentence: what the learner can do after this lesson. */
  objective: string;
  /** What to ask the lesson generator for (concrete topic + angle). */
  focus: string;
}

export interface CourseModule {
  title: string;
  lessons: LessonRef[];
}

export interface CourseOutline {
  id: string;
  title: string;
  description: string;
  /** The original user prompt. */
  topic: string;
  createdAt: number;
  modules: CourseModule[];
}

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
          "focus": "Concrete instruction for the lesson author: exactly what to teach and demo, including which code example to build."
        }
      ]
    }
  ]
}

RULES:
- 2-3 modules, 2-3 lessons each (each lesson is a 1-3 minute video — keep scope tight).
- Lessons must build on each other in order; no forward references.
- "focus" must name a specific, runnable example to build (not vague goals).
- Output ONLY the JSON object.`;

export function courseId(): string {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function normalizeOutline(raw: any, topic: string): CourseOutline {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.modules) || !raw.modules.length) {
    throw new Error('Outline has no modules');
  }
  let n = 0;
  const modules: CourseModule[] = raw.modules
    .filter((m: any) => m && Array.isArray(m.lessons) && m.lessons.length)
    .slice(0, 4)
    .map((m: any, mi: number) => ({
      title: String(m.title || `Module ${mi + 1}`),
      lessons: m.lessons.slice(0, 4).map((l: any, li: number) => ({
        id: `l-${mi}-${li}-${++n}`,
        title: String(l.title || `Lesson ${li + 1}`),
        objective: String(l.objective || ''),
        focus: String(l.focus || l.promptSeed || l.title || ''),
      })),
    }));
  if (!modules.length) throw new Error('Outline has no usable modules');
  return {
    id: courseId(),
    title: String(raw.title || topic),
    description: String(raw.description || ''),
    topic,
    createdAt: Date.now(),
    modules,
  };
}

export async function generateCourseOutline(
  topic: string,
  opts: GenerateOptions = {},
): Promise<CourseOutline> {
  const content = await chatJSON(OUTLINE_PROMPT, `Design a course about: ${topic}`, opts);
  return normalizeOutline(JSON.parse(extractJSON(content)), topic);
}

/** All lessons in course order, with module info attached. */
export function flattenLessons(outline: CourseOutline): { lesson: LessonRef; moduleIndex: number; moduleTitle: string; index: number }[] {
  const out: { lesson: LessonRef; moduleIndex: number; moduleTitle: string; index: number }[] = [];
  outline.modules.forEach((m, mi) => {
    m.lessons.forEach((l) => {
      out.push({ lesson: l, moduleIndex: mi, moduleTitle: m.title, index: out.length });
    });
  });
  return out;
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

  const context = [
    `This is lesson ${at + 1} of ${all.length} in the course "${outline.title}" (module: "${entry.moduleTitle}").`,
    prior.length
      ? `The learner has ALREADY covered: ${prior.map((p) => p.lesson.title).join('; ')}. Do not re-teach these — build on them.`
      : `This is the very first lesson — assume no prior knowledge of the topic.`,
    `Lesson title: "${entry.lesson.title}".`,
    entry.lesson.objective ? `Objective: ${entry.lesson.objective}` : '',
    `Teach exactly this: ${entry.lesson.focus}`,
    `Include one quiz checkpoint. End by hinting at the next lesson${
      at + 1 < all.length ? ` ("${all[at + 1].lesson.title}")` : ' — or, as this is the last lesson, recap the whole course'
    }.`,
  ]
    .filter(Boolean)
    .join('\n');

  return generateDSL(context, opts);
}
