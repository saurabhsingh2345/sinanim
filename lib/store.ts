// localStorage-backed course library. Client-side only — every function no-ops
// safely during SSR. Lesson DSLs are cached so a course only pays the LLM cost
// once per lesson; narration audio is intentionally NOT stored (re-synthesized
// on load, it's local and free).

import { AnimationDSL } from './types';
import { CourseOutline } from './course';

export interface LessonProgress {
  /** 0..1 how far the learner got. */
  watched: number;
  completed: boolean;
  quizCorrect: number;
  quizTotal: number;
}

export interface StoredCourse {
  outline: CourseOutline;
  /** lessonId -> generated timeline (cached). */
  lessons: Record<string, AnimationDSL>;
  /** lessonId -> progress. */
  progress: Record<string, LessonProgress>;
}

const INDEX_KEY = 'newani:courses:v1';
const courseKey = (id: string) => `newani:course:${id}`;

function canStore(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

function readJSON<T>(key: string): T | null {
  if (!canStore()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown) {
  if (!canStore()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('store: write failed (quota?)', e);
  }
}

export function listCourseIds(): string[] {
  return readJSON<string[]>(INDEX_KEY) || [];
}

export function listCourses(): CourseOutline[] {
  return listCourseIds()
    .map((id) => readJSON<StoredCourse>(courseKey(id))?.outline)
    .filter(Boolean) as CourseOutline[];
}

export function getCourse(id: string): StoredCourse | null {
  return readJSON<StoredCourse>(courseKey(id));
}

export function saveCourse(course: StoredCourse) {
  writeJSON(courseKey(course.outline.id), course);
  const ids = listCourseIds();
  if (!ids.includes(course.outline.id)) {
    writeJSON(INDEX_KEY, [course.outline.id, ...ids]);
  }
}

export function createCourse(outline: CourseOutline): StoredCourse {
  const course: StoredCourse = { outline, lessons: {}, progress: {} };
  saveCourse(course);
  return course;
}

export function saveLessonDSL(courseId: string, lessonId: string, dsl: AnimationDSL) {
  const course = getCourse(courseId);
  if (!course) return;
  course.lessons[lessonId] = dsl;
  saveCourse(course);
}

export function saveProgress(courseId: string, lessonId: string, patch: Partial<LessonProgress>) {
  const course = getCourse(courseId);
  if (!course) return;
  const cur: LessonProgress =
    course.progress[lessonId] || { watched: 0, completed: false, quizCorrect: 0, quizTotal: 0 };
  course.progress[lessonId] = {
    ...cur,
    ...patch,
    watched: Math.max(cur.watched, patch.watched ?? 0),
    completed: cur.completed || !!patch.completed,
  };
  saveCourse(course);
}

export function deleteCourse(id: string) {
  if (!canStore()) return;
  try {
    window.localStorage.removeItem(courseKey(id));
  } catch {}
  writeJSON(INDEX_KEY, listCourseIds().filter((c) => c !== id));
}

/** Fraction of lessons completed, for the library shelf. */
export function courseCompletion(course: StoredCourse): number {
  const total = course.outline.modules.reduce((a, m) => a + m.lessons.length, 0);
  if (!total) return 0;
  const done = Object.values(course.progress).filter((p) => p.completed).length;
  return done / total;
}
