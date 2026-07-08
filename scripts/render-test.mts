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
      type: 'code',
      language: 'python',
      code: 'def greet(name):\n    return f"Hello, {name}!"\n\nprint(greet("World"))',
      typingSpeed: 18,
      title: 'main.py',
      startTime: 0,
      duration: 5,
    },
    { type: 'click', button: 'Run', startTime: 5.2, duration: 0.5 },
    {
      type: 'terminal',
      output: 'Hello, World!',
      prompt: '$ python main.py\n',
      typingSpeed: 40,
      startTime: 5.8,
      duration: 3,
    },
    {
      type: 'text',
      content: 'f-strings interpolate variables inline',
      position: 'bottom',
      fadeIn: 0.4,
      fadeOut: 0.4,
      startTime: 6,
      duration: 3,
    },
  ],
});

const paced = repace(dsl);
console.log('paced duration:', paced.duration.toFixed(2), 's');
const prep = await prepare(paced);
const canvas = createCanvas(paced.width, paced.height);
const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;

const stamps = [1.6, 2.3, 4.0, 6.0, paced.duration - 0.2];
for (const t of stamps) {
  renderFrame(ctx, prep, t);
  const name = `scripts/frame-${t.toFixed(1)}.png`;
  writeFileSync(name, canvas.toBuffer('image/png'));
  console.log('wrote', name);
}
console.log('done');
