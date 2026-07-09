import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { writeFileSync, existsSync } from 'node:fs';
import { normalizeDSL, repace } from '../lib/dsl';
import { prepare, renderFrame } from '../lib/renderer';

for (const p of ['/System/Library/Fonts/Menlo.ttc']) {
  if (existsSync(p)) { try { GlobalFonts.registerFromPath(p, 'JetBrains Mono'); } catch {} }
}

const dsl = repace(normalizeDSL({
  title: 'Viz',
  scenes: [
    {
      type: 'viz', title: 'Bubble sort — one pass', vizKind: 'array',
      steps: [
        { caption: 'Compare the first two elements', array: ['5', '2', '8', '1', '9'], compare: [0, 1], pointers: [{ name: 'i', index: 0 }], vars: { swaps: '0' } },
        { caption: 'They are out of order — swap', array: ['2', '5', '8', '1', '9'], compare: [0, 1], pointers: [{ name: 'i', index: 0 }], vars: { swaps: '1' } },
        { caption: 'Move the pointer along', array: ['2', '5', '8', '1', '9'], compare: [2, 3], pointers: [{ name: 'i', index: 2 }], vars: { swaps: '1' } },
        { caption: 'Swap 8 and 1', array: ['2', '5', '1', '8', '9'], compare: [2, 3], pointers: [{ name: 'i', index: 2 }], vars: { swaps: '2' }, done: [4] },
      ],
      startTime: 0, duration: 12, narration: 'Bubble sort compares neighbours and swaps them when they are out of order.',
    },
    {
      type: 'viz', title: 'Recursion — factorial(3)', vizKind: 'stack',
      steps: [
        { caption: 'Call factorial of 3', stack: ['factorial(3)'], vars: { n: '3' } },
        { caption: 'It calls factorial of 2', stack: ['factorial(3)', 'factorial(2)'], vars: { n: '2' } },
        { caption: 'And factorial of 1 — the base case', stack: ['factorial(3)', 'factorial(2)', 'factorial(1)'], vars: { n: '1' } },
        { caption: 'Now the frames return, multiplying back up', stack: ['factorial(3)', 'factorial(2)'], vars: { result: '2' } },
      ],
      startTime: 13, duration: 12, narration: 'Each recursive call adds a frame to the call stack until the base case.',
    },
  ],
}));

const prep = await prepare(dsl);
const canvas = createCanvas(dsl.width, dsl.height);
const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;

const sort = dsl.scenes[0];
const rec = dsl.scenes[1];
const shots: [string, number][] = [
  ['viz-sort', sort.startTime + sort.duration * 0.55],
  ['viz-stack', rec.startTime + rec.duration * 0.62],
];
for (const [name, t] of shots) {
  renderFrame(ctx, prep, t);
  writeFileSync(`scripts/frame-${name}.png`, canvas.toBuffer('image/png'));
  console.log('wrote', name, '@', t.toFixed(1) + 's');
}
