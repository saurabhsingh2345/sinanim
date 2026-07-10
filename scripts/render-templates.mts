import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { writeFileSync, existsSync } from 'node:fs';
import { normalizeDSL, repace } from '../lib/dsl';
import { prepare, renderFrame } from '../lib/renderer';

for (const p of ['/System/Library/Fonts/Menlo.ttc']) if (existsSync(p)) { try { GlobalFonts.registerFromPath(p, 'JetBrains Mono'); } catch {} }

const dsl = repace(normalizeDSL({
  title: 'templates',
  scenes: [
    {
      type: 'cli', title: 'zsh — ~/todo-api', cwd: '~/todo-api',
      commands: [
        { command: 'npm create vite@latest my-app', output: '✔ Project scaffolded in ./my-app' },
        { command: 'cd my-app && npm install', output: 'added 231 packages in 3.2s' },
        { command: 'npm run dev', output: '\n  VITE v5.0.0  ready in 412 ms\n\n  ➜  Local:   http://localhost:5173/' },
      ],
      startTime: 0, duration: 18, narration: 'We scaffold a Vite app, install the dependencies, and start the dev server.',
    },
    {
      type: 'browser', url: 'https://my-app.dev', title: 'My App', theme: 'light',
      blocks: [
        { kind: 'nav', brand: '◆ Acme', links: ['Features', 'Pricing', 'Docs'] },
        { kind: 'hero', heading: 'Ship faster with Acme', sub: 'The all-in-one platform for building and shipping web apps.', cta: 'Get started' },
        { kind: 'card', title: 'Fast', body: 'Instant hot reload and optimized builds out of the box.' },
        { kind: 'card', title: 'Simple', body: 'A clean API that gets out of your way.' },
      ],
      clickBlock: 1,
      startTime: 19, duration: 12, narration: 'Here is the landing page rendering live in the browser, section by section.',
    },
    {
      type: 'split', language: 'html', filename: 'index.html', url: 'localhost:3000', theme: 'light',
      steps: [
        { caption: 'Add a heading', code: '<h1>Hello</h1>', blocks: [{ kind: 'hero', heading: 'Hello' }] },
        { caption: 'Add a button', code: '<h1>Hello</h1>\n<button>Click me</button>', blocks: [{ kind: 'hero', heading: 'Hello' }, { kind: 'button', label: 'Click me', primary: true }] },
      ],
      startTime: 32, duration: 12, narration: 'As we type the HTML on the left, the preview on the right updates instantly.',
    },
    {
      type: 'api', method: 'POST', url: 'https://api.acme.dev/v1/todos',
      requestBody: '{ "text": "Ship it" }',
      status: 201, statusText: 'Created',
      response: '{\n  "id": 42,\n  "text": "Ship it",\n  "done": false,\n  "createdAt": "2026-07-10T09:00:00Z"\n}',
      startTime: 45, duration: 10, narration: 'We POST a new todo and get back a 201 Created with the saved record.',
    },
  ],
}));

const prep = await prepare(dsl);
const canvas = createCanvas(dsl.width, dsl.height);
const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
const [cli, br, sp, api] = dsl.scenes;
const shots: [string, number][] = [
  ['tpl-cli', cli.startTime + cli.duration * 0.9],
  ['tpl-browser', br.startTime + br.duration * 0.85],
  ['tpl-split', sp.startTime + sp.duration * 0.9],
  ['tpl-api', api.startTime + api.duration * 0.9],
];
for (const [name, t] of shots) {
  renderFrame(ctx, prep, t);
  writeFileSync(`scripts/frame-${name}.png`, canvas.toBuffer('image/png'));
  console.log('wrote', name, '@', t.toFixed(1) + 's');
}
