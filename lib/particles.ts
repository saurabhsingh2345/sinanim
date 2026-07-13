// Seekable particle effects. Every particle's position is a closed-form function
// of elapsed time and a seed (simple Euler-integrated ballistics evaluated
// analytically), so a burst is fully deterministic and looks identical whether
// the frame is reached by playback or by a random seek — exactly what the
// deterministic renderer needs. No RAF, no live state.

import { rand01 } from './seedrng';
import { clamp } from './utils';

const CONFETTI_COLORS = ['#a78bfa', '#34d399', '#f472b6', '#fbbf24', '#60a5fa', '#f87171'];

type Ctx = CanvasRenderingContext2D;

/**
 * A celebratory confetti burst from (cx,cy). `t` = seconds since it started.
 * Pieces launch upward/outward, arc under gravity, spin, and fade over `life`.
 */
export function drawConfettiBurst(
  ctx: Ctx,
  cx: number,
  cy: number,
  t: number,
  seed: number,
  count = 90,
  life = 2.2,
  spread = 1,
) {
  if (t <= 0 || t >= life) return;
  ctx.save();
  for (let i = 0; i < count; i++) {
    const r = (k: number) => rand01(seed + i * 131 + k * 977);
    // launch: mostly upward fan
    const ang = -Math.PI / 2 + (r(1) - 0.5) * Math.PI * 1.1;
    const speed = (520 + r(2) * 720) * spread;
    const vx = Math.cos(ang) * speed;
    const vy = Math.sin(ang) * speed;
    const g = 1300 + r(3) * 500; // gravity px/s²
    const drag = 0.86 + r(4) * 0.1;
    // analytic-ish integration (drag folded in as a decaying velocity)
    const decay = (1 - Math.pow(drag, t * 60)) / (1 - drag) / 60;
    const x = cx + vx * decay + (r(5) - 0.5) * 30;
    const y = cy + vy * decay + 0.5 * g * t * t * 0.55;
    const fade = clamp(1 - t / life, 0, 1);
    if (y > cy + 900) continue;
    const size = 6 + r(6) * 7;
    const rot = t * (4 + r(7) * 10) + r(8) * 6.28;
    const flip = Math.cos(t * (6 + r(9) * 6)); // paper flutter
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(1, Math.max(0.2, Math.abs(flip)));
    ctx.fillStyle = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    ctx.fillRect(-size / 2, -size / 2, size, size * 0.6);
    ctx.restore();
  }
  ctx.restore();
}

/**
 * A quick radial spark burst — small dots flying out and fading. Good for a
 * reveal accent (bullet lands, node appears, correct answer).
 */
export function drawSparkBurst(
  ctx: Ctx,
  cx: number,
  cy: number,
  t: number,
  seed: number,
  color = '#a78bfa',
  count = 14,
  life = 0.5,
  radius = 90,
) {
  if (t <= 0 || t >= life) return;
  const p = t / life;
  const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + rand01(seed + i) * 0.4;
    const d = e * radius * (0.6 + rand01(seed + i * 7) * 0.6);
    const x = cx + Math.cos(ang) * d;
    const y = cy + Math.sin(ang) * d;
    ctx.globalAlpha = (1 - p) * 0.9;
    const s = 3 * (1 - p) + 1;
    ctx.beginPath();
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
