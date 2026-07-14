// Phase-1 preview for the `whiteboard` explainer template: hand-written text,
// imported SVG objects, and sketched annotations drawn on by a marker.
// Writes PNG snapshots (always) and, if ffmpeg is present, a silent MP4 so the
// draw-on motion is visible. Run: npx tsx scripts/render-whiteboard.mts
import './register-fonts.mts';
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { normalizeDSL, repace } from '../lib/dsl';
import { prepare, renderFrame } from '../lib/renderer';

const dsl = repace(normalizeDSL({
  title: 'Whiteboard demo',
  width: 1920,
  height: 1080,
  fps: 30,
  scenes: [
    {
      type: 'whiteboard',
      board: 'white',
      pen: true,
      steps: [
        { narration: 'How does learning stick?', add: [
          { kind: 'text', text: 'How learning sticks', at: [0.5, 0.13], size: 78 },
          { kind: 'underline', from: [0.28, 0.2], to: [0.72, 0.2] },
        ] },
        { narration: 'Start with a curious learner.', add: [
          { kind: 'object', src: 'student.svg', at: [0.22, 0.58], scale: 1.35 },
          { kind: 'text', text: 'you', at: [0.22, 0.9], size: 46 },
        ] },
        { narration: 'An idea appears —', add: [
          { kind: 'object', src: 'lightbulb.svg', at: [0.52, 0.42], scale: 1.0 },
          { kind: 'arrow', from: [0.32, 0.55], to: [0.46, 0.46] },
        ] },
        { narration: 'you practice it,', add: [
          { kind: 'object', src: 'book.svg', at: [0.78, 0.58], scale: 1.2 },
          { kind: 'text', text: 'practice', at: [0.78, 0.9], size: 46 },
          { kind: 'arrow', from: [0.6, 0.46], to: [0.72, 0.54] },
        ] },
        { narration: 'and it clicks into place.', add: [
          { kind: 'circle', from: [0.43, 0.28], to: [0.61, 0.56] },
        ] },
        { narration: 'Now it is yours.', add: [
          { kind: 'object', src: 'star.svg', at: [0.52, 0.42], scale: 0.5 },
        ] },
      ],
      startTime: 0,
      duration: 16,
      narration: 'Let me show you how learning actually sticks.',
    },
  ],
}));

const prep = await prepare(dsl);
const canvas = createCanvas(dsl.width, dsl.height);
const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;

// PNG snapshots across the beat
const sc = dsl.scenes[0];
for (const frac of [0.12, 0.3, 0.5, 0.7, 0.88, 0.99]) {
  const t = sc.startTime + sc.duration * frac;
  renderFrame(ctx, prep, t);
  const name = `whiteboard-${String(Math.round(frac * 100)).padStart(2, '0')}`;
  writeFileSync(`scripts/frame-${name}.png`, canvas.toBuffer('image/png'));
  console.log('wrote', name, '@', t.toFixed(1) + 's');
}

// Silent MP4 (skip gracefully if ffmpeg is missing)
const out = 'scripts/whiteboard-demo.mp4';
const ff = spawn('ffmpeg', [
  '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${dsl.width}x${dsl.height}`,
  '-r', String(dsl.fps), '-i', '-', '-c:v', 'libx264', '-preset', 'medium',
  '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out,
], { stdio: ['pipe', 'ignore', 'pipe'] });
let ffErr = '';
ff.stderr.on('data', (d) => { ffErr += d; });
const done = new Promise<void>((res) => {
  ff.on('close', (code) => { if (code === 0) console.log('wrote', out); else console.warn('ffmpeg skipped/failed:', ffErr.slice(-300)); res(); });
  ff.on('error', () => { console.warn('ffmpeg not found — PNGs only'); res(); });
});
const frames = Math.ceil(dsl.duration * dsl.fps);
for (let i = 0; i <= frames; i++) {
  renderFrame(ctx, prep, Math.min(i / dsl.fps, dsl.duration));
  const img = ctx.getImageData(0, 0, dsl.width, dsl.height);
  const buf = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  if (ff.stdin.writable) await new Promise<void>((res) => ff.stdin.write(buf, () => res()));
}
if (ff.stdin.writable) ff.stdin.end();
await done;
