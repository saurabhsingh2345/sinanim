import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { writeFileSync, existsSync } from 'node:fs';
import { drawMascot } from '../lib/mascot';

for (const p of ['/System/Library/Fonts/Menlo.ttc']) {
  if (existsSync(p)) { try { GlobalFonts.registerFromPath(p, 'JetBrains Mono'); } catch {} }
}
const c = createCanvas(92 * 2, 108 * 2);
const ctx = c.getContext('2d') as unknown as CanvasRenderingContext2D;
ctx.scale(2, 2);
ctx.fillStyle = '#12121a';
ctx.fillRect(0, 0, 92, 108);
drawMascot(ctx, { x: 46, y: 108 - 10, scale: (108 / 180) * 0.92, action: 'celebrate', local: 0.9, enterLocal: 0.9, life: Infinity, aimX: 100, aimY: 40 });
writeFileSync('scripts/frame-bit-small.png', c.toBuffer('image/png'));
console.log('wrote frame-bit-small.png');
