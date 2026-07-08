import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { repace } from '../lib/dsl';
import { prepare, renderFrame } from '../lib/renderer';

for (const p of ['/System/Library/Fonts/Menlo.ttc']) {
  if (existsSync(p)) { try { GlobalFonts.registerFromPath(p, 'JetBrains Mono'); } catch {} }
}

const dsl = repace(JSON.parse(readFileSync('/tmp/lesson-final.json', 'utf8')).dsl);
const prep = await prepare(dsl);
const canvas = createCanvas(dsl.width, dsl.height);
const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;

const diff = dsl.scenes.find((s) => s.type === 'diff')!;
const code = dsl.scenes.find((s) => s.type === 'code')!;
const shots: [string, number][] = [
  ['real-code', code.startTime + 0.9],
  ['real-diff', diff.startTime + 1.6],
];
for (const [n, t] of shots) {
  renderFrame(ctx, prep, t);
  writeFileSync(`scripts/frame-${n}.png`, canvas.toBuffer('image/png'));
  console.log('wrote', n, '@', t.toFixed(1) + 's');
}
