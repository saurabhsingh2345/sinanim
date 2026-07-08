import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { writeFileSync, existsSync } from 'node:fs';
import { drawMascot, MASCOT_ACTIONS } from '../lib/mascot';

for (const p of ['/System/Library/Fonts/Menlo.ttc']) {
  if (existsSync(p)) { try { GlobalFonts.registerFromPath(p, 'JetBrains Mono'); } catch {} }
}

const W = 1600, H = 500;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
ctx.fillStyle = '#0b0b10';
ctx.fillRect(0, 0, W, H);

const n = MASCOT_ACTIONS.length;
MASCOT_ACTIONS.forEach((action, i) => {
  const x = (W / n) * (i + 0.5);
  drawMascot(ctx, { x, y: H - 90, scale: 0.85, action, local: 0.9, life: Infinity, aimX: x, aimY: H - 250 });
  ctx.fillStyle = '#8b8a97';
  ctx.font = '22px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(action, x, H - 30);
});

writeFileSync('scripts/frame-mascot-poses.png', canvas.toBuffer('image/png'));
console.log('wrote scripts/frame-mascot-poses.png');
