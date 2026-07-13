// Reproduces the exact IDE bugs the user reported and verifies the fixes:
//  1. a later `type` snapshot that INSERTS a line at the TOP (old char-prefix
//     diff re-typed the whole file from line 1 — "erasing and rewriting")
//  2. a highlight whose line numbers are PAST end-of-file (glowed empty rows)
//  3. a React app whose `run` step used to dump fake stdout into the terminal
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { writeFileSync, existsSync } from 'node:fs';
import { normalizeDSL, repace } from '../lib/dsl';
import { prepare, renderFrame } from '../lib/renderer';

for (const p of ['/System/Library/Fonts/Menlo.ttc']) {
  if (existsSync(p)) { try { GlobalFonts.registerFromPath(p, 'JetBrains Mono'); } catch {} }
}

const dsl = repace(normalizeDSL({
  title: 'IDE fix check',
  scenes: [
    {
      type: 'ide',
      project: 'greeter',
      files: [{ path: 'greet.py', language: 'python', code: '' }],
      steps: [
        { caption: 'Write the function', narration: 'We start with a simple greet function.',
          action: { kind: 'type', file: 'greet.py', code: 'def greet(name):\n    return f"Hello {name}"' } },
        // BUG 1: inserts `import sys` + blank line ABOVE the existing function.
        { caption: 'Add an import at the top', narration: 'Now we add an import at the very top of the file.',
          action: { kind: 'type', file: 'greet.py', code: 'import sys\n\ndef greet(name):\n    return f"Hello {name}"' } },
        // BUG 2: highlight lines 40-42 — the file only has 4 lines.
        { caption: 'Highlight the return', narration: 'This return line builds the greeting string.',
          action: { kind: 'highlight', file: 'greet.py', startLine: 40, endLine: 42 } },
      ],
      startTime: 0, duration: 24,
    },
    {
      type: 'ide',
      project: 'react-app',
      files: [{ path: 'src/App.jsx', language: 'jsx', code: '' }],
      steps: [
        { caption: 'A React component', narration: 'Here is a tiny React component.',
          action: { kind: 'type', file: 'src/App.jsx', code: 'export default function App() {\n  return <h1>Hello</h1>;\n}' } },
        // BUG 3: a React app does NOT print program output to a terminal.
        { caption: 'Start the dev server', narration: 'We start the dev server and open the browser.',
          action: { kind: 'run', command: 'npm run dev', output: 'Hello\nRendered <h1>Hello</h1>\nComponent mounted' } },
      ],
      startTime: 0, duration: 16,
    },
  ],
}));

const prep = await prepare(dsl);
const canvas = createCanvas(dsl.width, dsl.height);
const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;

const a = dsl.scenes[0], b = dsl.scenes[1];
const shots: [string, number][] = [
  ['fx-1-fn',       a.startTime + a.duration * 0.28],   // function typed
  ['fx-2-insert',   a.startTime + a.duration * 0.45],   // import typing in AT TOP (function must stay)
  ['fx-3-inserted', a.startTime + a.duration * 0.58],   // both present, in order
  ['fx-4-hi',       a.startTime + a.duration * 0.85],   // highlight clamped to real lines
  ['fx-5-react',    b.startTime + b.duration * 0.35],   // react typed
  ['fx-6-devserver',b.startTime + b.duration * 0.9],    // terminal shows dev-server banner
];
for (const [name, t] of shots) {
  renderFrame(ctx, prep, t);
  writeFileSync(`scripts/frame-${name}.png`, canvas.toBuffer('image/png'));
  console.log('wrote', name, '@', t.toFixed(1) + 's');
}
