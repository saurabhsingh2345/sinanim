// Repro for the "VS Code writes on line 1 and erases" bug.
// The LLM is *supposed* to give the WHOLE file each type step (cumulative), but
// often emits just the new chunk per step. This harness deliberately authors
// NON-cumulative type steps on the same file to reproduce the erase, then we
// verify the normalizer makes them cumulative so lines advance.
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { writeFileSync, existsSync } from 'node:fs';
import { normalizeDSL, repace } from '../lib/dsl';
import { prepare, renderFrame } from '../lib/renderer';

for (const p of ['/System/Library/Fonts/Menlo.ttc']) {
  if (existsSync(p)) { try { GlobalFonts.registerFromPath(p, 'JetBrains Mono'); } catch {} }
}

const dsl = repace(normalizeDSL({
  title: 'f-strings',
  scenes: [
    {
      type: 'ide',
      project: 'fstrings',
      files: [{ path: 'main.py', language: 'python', code: '' }],
      steps: [
        // NON-cumulative: each step is only the new line(s), NOT the whole file.
        { caption: 'A name', action: { kind: 'type', file: 'main.py', code: 'name = "Ada"' }, narration: 'We start with a name.' },
        { caption: 'An age', action: { kind: 'type', file: 'main.py', code: 'age = 36' }, narration: 'Then an age.' },
        { caption: 'The f-string', action: { kind: 'type', file: 'main.py', code: 'print(f"{name} is {age}")' }, narration: 'Now the f-string that stitches them together.' },
        { caption: 'Run it', action: { kind: 'run', command: 'python main.py', output: 'Ada is 36' }, narration: 'And we run it.' },
      ],
      startTime: 0, duration: 24,
      narration: 'A tiny f-strings demo built line by line.',
    },
  ],
}));

const ide: any = dsl.scenes[0];
// Print what the normalizer produced for each type step so we can see cumulative-ness.
console.log('--- normalized type steps ---');
for (const st of ide.steps) {
  if (st.action.kind === 'type') console.log(`[type ${st.action.file}] ${JSON.stringify(st.action.code)}`);
}

const prep = await prepare(dsl);
const canvas = createCanvas(dsl.width, dsl.height);
const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;

const shots: [string, number][] = [
  ['nl-1', ide.startTime + ide.duration * 0.18],
  ['nl-2', ide.startTime + ide.duration * 0.42],
  ['nl-3', ide.startTime + ide.duration * 0.66],
  ['nl-run', ide.startTime + ide.duration * 0.95],
];
for (const [name, t] of shots) {
  renderFrame(ctx, prep, t);
  writeFileSync(`scripts/frame-${name}.png`, canvas.toBuffer('image/png'));
  console.log('wrote', name, '@', t.toFixed(1) + 's');
}
