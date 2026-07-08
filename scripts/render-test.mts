// Headless verification of the canvas renderer. Renders real frames of a sample
// timeline to PNGs so we can eyeball layout/typing/terminal/caption without a browser.
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { writeFileSync, existsSync } from 'node:fs';
import { normalizeDSL, repace } from '../lib/dsl';
import { prepare, renderFrame } from '../lib/renderer';

// Best-effort: register a monospace font if one is around (falls back otherwise).
for (const p of [
  '/System/Library/Fonts/Menlo.ttc',
  '/System/Library/Fonts/Monaco.ttf',
  '/Library/Fonts/Courier New.ttf',
]) {
  if (existsSync(p)) {
    try {
      GlobalFonts.registerFromPath(p, 'JetBrains Mono');
      break;
    } catch {}
  }
}

const dsl = normalizeDSL({
  title: 'Python Hello World',
  scenes: [
    {
      type: 'title',
      text: 'Python f-strings',
      subtitle: 'a 60-second tutorial',
      startTime: 0,
      duration: 2.5,
      narration: 'Welcome! Today we will learn how f-strings work in Python.',
    },
    {
      type: 'bullets',
      title: "What you'll learn",
      items: ['Embedding values in strings', 'Format specifiers', 'When to reach for f-strings'],
      startTime: 2.5,
      duration: 5,
      narration: 'Here is what we will cover in this lesson.',
    },
    {
      type: 'chapter',
      number: 1,
      text: 'The basics',
      startTime: 7.5,
      duration: 2.5,
      narration: 'Chapter one: the basics.',
    },
    {
      type: 'code',
      language: 'python',
      code: 'def greet(name):\n    return f"Hello, {name}!"\n\nprint(greet("World"))',
      typingSpeed: 18,
      title: 'main.py',
      startTime: 2.5,
      duration: 5,
      narration: 'Let us define a function that greets whoever we pass in.',
    },
    { type: 'click', button: 'Run', startTime: 7.7, duration: 0.5 },
    {
      type: 'terminal',
      output: 'Hello, World!',
      prompt: '$ python main.py\n',
      typingSpeed: 40,
      startTime: 8.3,
      duration: 3,
      narration: 'And when we run it, Python prints our greeting.',
    },
    {
      type: 'diff',
      language: 'python',
      before: 'def greet(name):\n    return f"Hello, {name}!"\n\nprint(greet("World"))',
      after: 'def greet(name, excited=False):\n    end = "!!!" if excited else "!"\n    return f"Hello, {name}{end}"\n\nprint(greet("World", excited=True))',
      typingSpeed: 18,
      title: 'main.py',
      startTime: 11.5,
      duration: 8,
      narration: 'Now let us evolve the function to support an excited mode.',
    },
    {
      type: 'diagram',
      title: 'How formatting flows',
      nodes: [
        { id: 'src', label: 'f-string', x: 0.22, y: 0.5 },
        { id: 'fmt', label: 'format engine', x: 0.5, y: 0.5 },
        { id: 'out', label: 'final text', x: 0.78, y: 0.5 },
      ],
      edges: [
        { from: 'src', to: 'fmt', label: 'parse' },
        { from: 'fmt', to: 'out' },
      ],
      startTime: 30,
      duration: 6,
      narration: 'Under the hood, the expression flows through the format engine.',
    },
    {
      type: 'quiz',
      question: 'What does the f before a string literal do?',
      options: ['Enables inline expressions', 'Freezes the string', 'Formats floats only'],
      answerIndex: 0,
      explanation: 'The f prefix lets you embed any expression in braces.',
      startTime: 36,
      duration: 8,
      narration: 'Quick check before we wrap up.',
    },
  ],
});

const paced = repace(dsl);
console.log('paced duration:', paced.duration.toFixed(2), 's');
const prep = await prepare(paced);
const canvas = createCanvas(paced.width, paced.height);
const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;

const byType = (type: string) => paced.scenes.find((s) => s.type === type)!;
const diffScene = byType('diff');
const quizScene = byType('quiz');
const shots: [string, number][] = [
  ['title', 1.0],
  ['bullets', byType('bullets').startTime + 3.2],
  ['chapter', byType('chapter').startTime + 1.2],
  ['code-typing', byType('code').startTime + 2.0],
  ['terminal', byType('terminal').startTime + 1.2],
  ['diff-hold', diffScene.startTime + 0.6],
  ['diff-collapse', diffScene.startTime + 1.4],
  ['diff-typing', diffScene.startTime + 3.5],
  ['diagram', byType('diagram').startTime + 2.6],
  ['quiz-options', quizScene.startTime + 2.0],
  ['quiz-reveal', quizScene.startTime + quizScene.duration - 0.8],
];
for (const [label, t] of shots) {
  renderFrame(ctx, prep, t);
  const name = `scripts/frame-${label}.png`;
  writeFileSync(name, canvas.toBuffer('image/png'));
  console.log('wrote', name, `(t=${t.toFixed(1)}s)`);
}
console.log('done');
