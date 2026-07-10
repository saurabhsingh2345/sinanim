import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { writeFileSync, existsSync } from 'node:fs';
import { normalizeDSL, repace } from '../lib/dsl';
import { prepare, renderFrame } from '../lib/renderer';

for (const p of ['/System/Library/Fonts/Menlo.ttc']) {
  if (existsSync(p)) { try { GlobalFonts.registerFromPath(p, 'JetBrains Mono'); } catch {} }
}

const dsl = repace(normalizeDSL({
  title: 'IDE walkthrough',
  scenes: [
    {
      type: 'ide',
      project: 'todo-api',
      files: [
        { path: 'app.py', language: 'python', code: '' },
        { path: 'requirements.txt', language: 'text', code: 'flask\n' },
      ],
      steps: [
        { caption: 'Create a new file', action: { kind: 'create', file: 'models/todo.py' } },
        { caption: 'Define the Todo model', action: { kind: 'type', file: 'models/todo.py', code: 'class Todo:\n    def __init__(self, text):\n        self.text = text\n        self.done = False\n\n    def toggle(self):\n        self.done = not self.done' } },
        { caption: 'Wire up the Flask app', action: { kind: 'type', file: 'app.py', code: 'from flask import Flask, jsonify\nfrom models.todo import Todo\n\napp = Flask(__name__)\ntodos = [Todo("Ship the IDE template")]\n\n@app.route("/todos")\ndef list_todos():\n    return jsonify([t.text for t in todos])' } },
        { caption: 'Highlight the route', action: { kind: 'highlight', file: 'app.py', startLine: 7, endLine: 9 } },
        { caption: 'Run it', action: { kind: 'run', command: 'python app.py', output: ' * Serving Flask app "app"\n * Running on http://127.0.0.1:5000\n127.0.0.1 - - "GET /todos" 200' } },
      ],
      startTime: 0, duration: 30,
      narration: 'Let us build a tiny todo API. We define a model, wire up a Flask route, and run it — all without leaving the editor.',
    },
  ],
}));

const prep = await prepare(dsl);
const canvas = createCanvas(dsl.width, dsl.height);
const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;

const ide = dsl.scenes[0];
const shots: [string, number][] = [
  ['ide-create', ide.startTime + ide.duration * 0.06],
  ['ide-type', ide.startTime + ide.duration * 0.30],
  ['ide-app', ide.startTime + ide.duration * 0.60],
  ['ide-hi', ide.startTime + ide.duration * 0.78],
  ['ide-run', ide.startTime + ide.duration * 0.95],
];
for (const [name, t] of shots) {
  renderFrame(ctx, prep, t);
  writeFileSync(`scripts/frame-${name}.png`, canvas.toBuffer('image/png'));
  console.log('wrote', name, '@', t.toFixed(1) + 's');
}
