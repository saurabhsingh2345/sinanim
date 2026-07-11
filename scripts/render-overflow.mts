import { writeFileSync } from 'node:fs';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { normalizeDSL } from '../lib/dsl';
import { prepare, renderFrame } from '../lib/renderer';
import { existsSync } from 'node:fs';
for (const p of ['/System/Library/Fonts/Menlo.ttc']) if (existsSync(p)) GlobalFonts.registerFromPath(p, 'JetBrains Mono');

const dsl = normalizeDSL({
  fps: 30, width: 1920, height: 1080, theme: 'midnight',
  scenes: [
    { type: 'title', text: 'Understanding Asynchronous JavaScript Event Loops and Microtask Queues', subtitle: 'a surprisingly deep dive into what happens between your await and the actual work being done', startTime: 0, duration: 4 },
    { type: 'bullets', title: 'What you will actually learn in this lesson', items: [
      'How the event loop decides which task runs next and why your setTimeout of zero milliseconds still waits',
      'The difference between the microtask queue and the macrotask queue, and which one promises use',
      'Why awaiting inside a loop serializes your requests and how Promise.all fixes it',
      'A mental model you can use to predict output order without running the code',
    ], startTime: 4, duration: 8 },
    { type: 'quiz', question: 'When you await a promise inside an async function, what actually happens to the rest of the function body after the await keyword?', options: [
      'It runs immediately on the next line like normal synchronous code would',
      'It is scheduled as a microtask that runs after the current call stack empties',
      'It is thrown away and re-executed from the beginning when the promise settles',
    ], answerIndex: 1, explanation: 'The continuation is wrapped as a microtask — that is why code after an await never runs in the same tick as the code before it, even for already-resolved promises.', startTime: 12, duration: 8 },
    { type: 'bigstat', value: '~11,000ms', label: 'time wasted by sequential awaits in a ten-request loop that could run in parallel', startTime: 20, duration: 4 },
    { type: 'chapter', number: 2, text: 'The Microtask Queue and Why Ordering Matters More Than You Think', startTime: 24, duration: 4 },
    { type: 'quote', text: 'Programs must be written for people to read, and only incidentally for machines to execute — and asynchrony is where that principle is tested hardest.', attribution: 'Abelson & Sussman, loosely', startTime: 28, duration: 4 },
  ],
});
const prep = await prepare(dsl);
const canvas = createCanvas(1920, 1080);
const ctx = canvas.getContext('2d') as any;
const shots: [string, number][] = [['of-title', 2], ['of-bullets', 11], ['of-quiz', 19.5], ['of-bigstat', 22], ['of-chapter', 26.5], ['of-quote', 30.5]];
for (const [name, t] of shots) {
  renderFrame(ctx, prep, t);
  writeFileSync(`/tmp/${name}.png`, canvas.toBuffer('image/png'));
  console.log('wrote', name);
}
