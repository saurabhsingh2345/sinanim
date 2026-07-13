import { validateCourseDAG, pruneDanglingPrereqs, conceptsBefore, CourseOutline } from '../lib/course';

const mk = (): CourseOutline => ({
  id: 'c', title: 'Async JS', description: '', topic: 'async', createdAt: 0,
  modules: [{ title: 'M1', lessons: [
    { id: 'l1', title: 'Callbacks', objective: '', focus: '', concepts: ['callbacks'], prereqs: [] },
    { id: 'l2', title: 'Promises', objective: '', focus: '', concepts: ['promises'], prereqs: ['callbacks'] },
    { id: 'l3', title: 'Async/await', objective: '', focus: '', concepts: ['async/await'], prereqs: ['promises', 'generators'] }, // 'generators' is dangling
  ]}],
});

const o = mk();
const before = validateCourseDAG(o);
console.log('BEFORE prune — ok:', before.ok, '| issues:', before.issues);
console.log('conceptsBefore(l3):', conceptsBefore(o, 2));

pruneDanglingPrereqs(o);
const after = validateCourseDAG(o);
console.log('AFTER prune  — ok:', after.ok, '| issues:', after.issues);
console.log('l3 prereqs after prune:', o.modules[0].lessons[2].prereqs);
