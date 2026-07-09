import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { writeFileSync, existsSync } from 'node:fs';
import { normalizeDSL, repace } from '../lib/dsl';
import { prepare, renderFrame } from '../lib/renderer';

for (const p of ['/System/Library/Fonts/Menlo.ttc']) {
  if (existsSync(p)) { try { GlobalFonts.registerFromPath(p, 'JetBrains Mono'); } catch {} }
}

const dsl = repace(normalizeDSL({
  title: 'Highlight + Mascot + Quiz check',
  scenes: [
    {
      type: 'code', language: 'python', title: 'main.py',
      code: 'def greet(name):\n    msg = f"Hello, {name}!"\n    print(msg)\n    return msg\n\ngreet("World")',
      startTime: 0, duration: 6, narration: 'Here we define a small greeting function step by step.',
    },
    { type: 'highlight', startLine: 2, endLine: 2, startTime: 2, duration: 3 },
    { type: 'mascot', action: 'point', line: 2, startTime: 2, duration: 3 },
    {
      type: 'quiz', question: 'What does an f-string let you do?',
      options: ['Embed expressions in braces', 'Freeze the string', 'Format floats only'],
      answerIndex: 0, explanation: 'The f prefix evaluates the braces inline.',
      startTime: 8, duration: 8, narration: 'Quick check before we move on to the next idea.',
    },
  ],
}));

const prep = await prepare(dsl);
const canvas = createCanvas(dsl.width, dsl.height);
const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;

const hl = dsl.scenes.find((s) => s.type === 'highlight')!;
const quiz = dsl.scenes.find((s) => s.type === 'quiz')!;

const shots: [string, number, any][] = [
  ['fix-highlight', hl.startTime + 1.2, undefined],
  // interactive quiz mid-wait: answer must be HIDDEN
  ['fix-quiz-waiting', quiz.startTime + 3, { interactive: true, quiz: { selected: null, correct: null }, uiTime: 3 }],
];
for (const [name, t, ui] of shots) {
  renderFrame(ctx, prep, t, ui);
  writeFileSync(`scripts/frame-${name}.png`, canvas.toBuffer('image/png'));
  console.log('wrote', name, '@', t.toFixed(1) + 's');
}
