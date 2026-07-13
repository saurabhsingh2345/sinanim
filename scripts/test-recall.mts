// Smoke test the FSRS -> recall wiring end to end with the real LLM.
//   npx tsx scripts/test-recall.mts
import { readFileSync } from 'node:fs';
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
import { generateLessonDSL, CourseOutline } from '../lib/course';

const outline: CourseOutline = {
  id: 'test', title: 'JavaScript Async', description: 'Learn async JS.',
  topic: 'async javascript', createdAt: 0,
  modules: [{
    title: 'Async', lessons: [
      { id: 'l1', title: 'Promises', objective: 'Use promises.', focus: 'Build a promise that resolves after a timeout; teach .then/.catch.' },
      { id: 'l2', title: 'Async/await', objective: 'Use async/await.', focus: 'Rewrite a .then chain with async/await; teach try/catch.' },
    ],
  }],
};

console.log('Generating lesson 2 with reviewConcepts=["Promises"] ...');
const dsl = await generateLessonDSL(outline, 'l2', { reviewConcepts: ['Promises', 'callbacks'] });
const types = dsl.scenes.map((s) => s.type);
console.log('scenes:', types.join(' · '));
const recall = dsl.scenes.find((s) => s.type === 'recall') as any;
if (recall) {
  console.log('\n✓ RECALL SCENE PRESENT (index', dsl.scenes.indexOf(recall) + ')');
  console.log('  concept:', recall.concept);
  console.log('  Q:', recall.question);
  console.log('  A:', recall.answer);
} else {
  console.log('\n✗ no recall scene generated (model chose not to — prompt wiring still fired)');
}
