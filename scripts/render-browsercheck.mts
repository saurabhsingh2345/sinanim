// Verify the browser template renders a REAL captured page (not ctx.fillText).
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { writeFileSync, existsSync } from 'node:fs';
import { normalizeDSL, repace } from '../lib/dsl';
import { prepare, renderFrame } from '../lib/renderer';
import { ensureBrowserShots } from '../lib/render/capture-page';

for (const p of ['/System/Library/Fonts/Menlo.ttc']) {
  if (existsSync(p)) { try { GlobalFonts.registerFromPath(p, 'JetBrains Mono'); } catch {} }
}

const dsl = repace(normalizeDSL({
  title: 'Browser check',
  scenes: [
    {
      type: 'browser',
      url: 'https://example.com',
      title: 'Example Domain',
      blocks: [{ kind: 'hero', heading: 'fallback only', sub: 'should NOT be visible' }],
      startTime: 0, duration: 8,
    },
  ],
}));

console.log('capturing…');
await ensureBrowserShots(dsl);
console.log('scene.shot =', (dsl.scenes[0] as any).shot ?? '(none — fell back to mock)');

const prep = await prepare(dsl);
const canvas = createCanvas(dsl.width, dsl.height);
const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
renderFrame(ctx, prep, 4);
writeFileSync('scripts/frame-browser-real.png', canvas.toBuffer('image/png'));
console.log('wrote frame-browser-real.png');
