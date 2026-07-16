// Course engine: a prompt becomes a course outline (modules → lessons), and each
// lesson becomes an AnimationDSL on demand — generated with context about what
// earlier lessons already covered, so the course actually builds on itself.

// NOTE: this module must stay client-safe — it is imported by client pages/
// components (for flattenLessons, the concept-DAG helpers, and the types). The
// actual course/lesson GENERATION lives in lib/course-gen.ts, which imports the
// LLM pipeline (and its node-only deps). Do not import ./llm from here.

export interface LessonRef {
  id: string;
  title: string;
  /** One sentence: what the learner can do after this lesson. */
  objective: string;
  /** What to ask the lesson generator for (concrete topic + angle). */
  focus: string;
  /** New concepts this lesson TEACHES (short names), e.g. ["closures"]. The
   *  course-wide concept DAG is built from these + `prereqs`. */
  concepts?: string[];
  /** Concepts (taught by EARLIER lessons) this one builds on. Every prereq must
   *  resolve to a concept introduced upstream — enforced by validateCourseDAG. */
  prereqs?: string[];
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

export function courseId(): string {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Normalize a concept-name list: strings, trimmed, deduped, capped. */
function cleanConceptList(v: any): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of v) {
    const s = String(c || '').trim();
    if (s && !seen.has(s.toLowerCase())) { seen.add(s.toLowerCase()); out.push(s); }
    if (out.length >= 4) break;
  }
  return out;
}

// ── Cross-course concept DAG ─────────────────────────────────────────────────────
// The outline is a linear lesson order, but concepts form a dependency graph
// across the whole course. These helpers make that graph explicit and lintable:
// every lesson builds on concepts introduced upstream, and generation is told
// exactly which prior concepts to assume known.

/** All concepts introduced by lessons BEFORE the given course index. */
export function conceptsBefore(outline: CourseOutline, index: number): string[] {
  const all = flattenLessons(outline);
  const set = new Set<string>();
  for (let i = 0; i < index && i < all.length; i++) {
    for (const c of all[i].lesson.concepts || []) set.add(c);
  }
  return Array.from(set);
}

export interface CourseDAGReport {
  ok: boolean;
  /** Course-order lesson indices (already topological since lessons are ordered). */
  order: number[];
  /** Human-readable problems: a prereq not introduced by any earlier lesson. */
  issues: string[];
}

/** Validate that every lesson's prereqs resolve to a concept taught upstream.
 *  Deterministic — no LLM. A dangling prereq means a broken learning path. */
export function validateCourseDAG(outline: CourseOutline): CourseDAGReport {
  const all = flattenLessons(outline);
  const issues: string[] = [];
  const introduced = new Set<string>();
  const norm = (s: string) => s.trim().toLowerCase();
  all.forEach((entry, i) => {
    for (const p of entry.lesson.prereqs || []) {
      if (!introduced.has(norm(p))) {
        issues.push(`Lesson ${i + 1} ("${entry.lesson.title}") needs "${p}" but no earlier lesson teaches it.`);
      }
    }
    for (const c of entry.lesson.concepts || []) introduced.add(norm(c));
  });
  return { ok: issues.length === 0, order: all.map((_, i) => i), issues };
}

/** Drop any prereq a lesson declares that no earlier lesson actually teaches, so
 *  the concept DAG is always valid (no dangling edges) before we generate from it.
 *  Mutates and returns the outline. */
export function pruneDanglingPrereqs(outline: CourseOutline): CourseOutline {
  const introduced = new Set<string>();
  const norm = (s: string) => s.trim().toLowerCase();
  for (const m of outline.modules) {
    for (const l of m.lessons) {
      if (l.prereqs?.length) l.prereqs = l.prereqs.filter((p) => introduced.has(norm(p)));
      for (const c of l.concepts || []) introduced.add(norm(c));
    }
  }
  return outline;
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
        concepts: cleanConceptList(l.concepts),
        prereqs: cleanConceptList(l.prereqs),
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
