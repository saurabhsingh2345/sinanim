// Reusable visual + determinism harness used across the overhaul phases.
//   npx tsx scripts/render-showcase.mts [scaffoldId ...]
// Renders representative frames from the built-in scaffolds into scripts/out/
// and asserts the renderer is byte-deterministic (same t → identical PNG).

import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { normalizeDSL, repace } from '../lib/dsl';
import { prepare, renderFrame } from '../lib/renderer';
import { TEMPLATES } from '../lib/scaffolds';

for (const p of ['/System/Library/Fonts/Menlo.ttc', '/Library/Fonts/Arial.ttf'])
  if (existsSync(p)) { try { GlobalFonts.registerFromPath(p, 'JetBrains Mono'); } catch {} }

const OUT = 'scripts/out';
mkdirSync(OUT, { recursive: true });

const want = process.argv.slice(2);
const picks = TEMPLATES.filter((t) => want.length === 0 || want.includes(t.id));
// default subset that touches the most scene types quickly
const DEFAULT_IDS = ['python-loops', 'diagram', 'api', 'pr', 'browser'];
const list = want.length ? picks : TEMPLATES.filter((t) => DEFAULT_IDS.includes(t.id));

let determinismOk = true;

for (const tpl of list) {
  const dsl = repace(normalizeDSL(tpl.build()));
  const prep = await prepare(dsl);
  const canvas = createCanvas(dsl.width, dsl.height);
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;

  // sample 4 evenly-spaced moments across the lesson
  const total = dsl.scenes.reduce((m: number, s: any) => Math.max(m, s.startTime + s.duration), 0);
  const times = [0.12, 0.4, 0.66, 0.9].map((f) => +(total * f).toFixed(2));
  times.forEach((t, i) => {
    renderFrame(ctx, prep, t);
    writeFileSync(`${OUT}/${tpl.id}-${i}-${t}s.png`, canvas.toBuffer('image/png'));
  });

  // determinism: render the middle frame twice, compare hashes
  const t = times[1];
  renderFrame(ctx, prep, t);
  const h1 = createHash('sha1').update(canvas.toBuffer('image/png')).digest('hex');
  renderFrame(ctx, prep, t);
  const h2 = createHash('sha1').update(canvas.toBuffer('image/png')).digest('hex');
  const ok = h1 === h2;
  if (!ok) determinismOk = false;
  console.log(`${ok ? '✓' : '✗ NONDETERMINISTIC'} ${tpl.id.padEnd(16)} total=${total.toFixed(1)}s frames=${times.join(',')}`);
}

console.log(determinismOk ? '\nDETERMINISM OK — all frames byte-identical on re-render' : '\n*** DETERMINISM BROKEN ***');
if (!determinismOk) process.exit(1);
