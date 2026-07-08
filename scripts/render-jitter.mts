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

// code-text region (center band where the panel body lives)
const rx = 300, ry = 380, rw = 1320, rh = 340;
const crop = () => Buffer.from(ctx.getImageData(rx, ry, rw, rh).data);

function maxDrift(a: Buffer, b: Buffer): number {
  let max = 0;
  for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i] - b[i]));
  return max;
}

const code = dsl.scenes.find((s) => s.type === 'code')!;
const hold = code.startTime + code.duration - 0.3;

renderFrame(ctx, prep, hold);
const a = crop();
writeFileSync('scripts/frame-hold-a.png', canvas.toBuffer('image/png'));
renderFrame(ctx, prep, hold + 1 / 30);
const b = crop();

console.log('code-region max per-channel drift over 1/30s:', maxDrift(a, b), '(0 = perfectly still)');

// and during the morph move phase (expected to move — sanity that motion still exists)
const diff = dsl.scenes.find((s) => s.type === 'diff');
if (diff) {
  renderFrame(ctx, prep, diff.startTime + 1.0);
  const m1 = crop();
  renderFrame(ctx, prep, diff.startTime + 1.0 + 1 / 30);
  const m2 = crop();
  console.log('code-region drift DURING morph:', maxDrift(m1, m2), '(should be > 0)');
}
