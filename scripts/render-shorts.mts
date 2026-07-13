// Verify the 9:16 shorts pipeline: derive a vertical teaser from a scaffold and
// render sample frames.  npx tsx scripts/render-shorts.mts [scaffoldId]
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync } from 'node:fs';
import './register-fonts.mts';
import { normalizeDSL, repace } from '../lib/dsl';
import { prepare, renderFrame } from '../lib/renderer';
import { toShorts } from '../lib/shorts';
import { TEMPLATES } from '../lib/scaffolds';

const OUT = 'scripts/out';
mkdirSync(OUT, { recursive: true });
const id = process.argv[2] || 'python-loops';
const tpl = TEMPLATES.find((t) => t.id === id)!;

const full = repace(normalizeDSL(tpl.build()));
const short = toShorts(full, { maxSeconds: 45 });
console.log(`shorts[${id}]: ${short.scenes.length} scenes →`, short.scenes.map((s) => s.type).join(' · '));

const prep = await prepare(short);
const canvas = createCanvas(short.width, short.height);
const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
const total = short.scenes.reduce((m: number, s: any) => Math.max(m, s.startTime + s.duration), 0);
[0.1, 0.35, 0.6, 0.88].forEach((f, i) => {
  const t = +(total * f).toFixed(2);
  renderFrame(ctx, prep, t);
  writeFileSync(`${OUT}/short-${id}-${i}-${t}s.png`, canvas.toBuffer('image/png'));
});
console.log(`ok — ${short.width}×${short.height}, total ${total.toFixed(1)}s`);
