// "Bit" — the studio mascot. A hovering violet robot drawn purely from canvas
// primitives, so it costs nothing to ship and renders identically in preview
// and export. Every pose is a deterministic function of `local` time; the LLM
// scripts WHERE and WHEN it appears (mascot scenes), the renderer supplies
// pixel targets (a code line, a quiz card), and Bit does the acting.
//
// Anchor: bottom-center of the hover point (the shadow sits at o.y).

import { clamp, easeInOut, easeOutCubic, hash01, lerp } from './utils';
import { springOut } from './motion';

export type MascotAction = 'wave' | 'point' | 'think' | 'celebrate' | 'shocked' | 'idle';

export const MASCOT_ACTIONS: MascotAction[] = ['wave', 'point', 'think', 'celebrate', 'shocked', 'idle'];

export interface MascotOpts {
  /** Anchor (bottom-center), in frame px. */
  x: number;
  y: number;
  /** 1 ≈ 175px tall. */
  scale: number;
  action: MascotAction;
  /** Action clock: seconds since the CURRENT pose/action began (drives pose). */
  local: number;
  /** Presence clock: seconds Bit has been on screen (drives the enter pop). When
   *  omitted, falls back to `local`. Keep large for a persistent, stable Bit so
   *  changing actions never re-triggers the entrance pop. */
  enterLocal?: number;
  /** Total lifetime in seconds (drives the exit); Infinity = stays. */
  life: number;
  /** A pixel point to look at / point at (frame coords). */
  aimX?: number;
  aimY?: number;
  /** Face left instead of right. */
  flip?: boolean;
}

const BODY = '#a78bfa';
const BODY_DEEP = '#7c5cf0';
const FACE = '#221c33';
const EYE = '#e9f6ff';
const ACCENT = '#c4b5fd';

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

function limb(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, r: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/** 0..1 presence: springs in over 0.4s, drops out over the last 0.35s. */
export function mascotPresence(local: number, life: number): number {
  const enter = clamp(local / 0.4, 0, 1);
  const exit = isFinite(life) ? clamp((life - local) / 0.35, 0, 1) : 1;
  return Math.min(enter, exit);
}

export function drawMascot(ctx: CanvasRenderingContext2D, o: MascotOpts) {
  const el = o.enterLocal ?? o.local; // presence clock (independent of action)
  const presence = mascotPresence(el, o.life);
  if (presence <= 0) return;
  const enterPop = springOut(clamp(el / 0.4, 0, 1));
  const exitEase = isFinite(o.life) ? easeInOut(clamp((o.life - el) / 0.35, 0, 1)) : 1;
  const t = o.local; // action/pose clock

  // ── hover + action-level body motion ──
  let bob = Math.sin(t * 2.3) * 5;
  let leanDeg = Math.sin(t * 0.9) * 1.5;
  let jump = 0;
  if (o.action === 'celebrate') {
    jump = Math.abs(Math.sin(t * 4.6)) * 20;
    leanDeg = Math.sin(t * 9.2) * 4;
  } else if (o.action === 'shocked') {
    leanDeg = -9 * easeOutCubic(clamp(t / 0.25, 0, 1));
    if (t < 0.6) bob += Math.sin(t * 42) * 1.6 * (1 - t / 0.6);
  } else if (o.action === 'point') {
    leanDeg = 5;
  }

  const s = o.scale * lerp(0.6, 1, enterPop);
  const cx = o.x;
  const groundY = o.y;

  // aim in local (unscaled, unflipped) coords
  const flipK = o.flip ? -1 : 1;
  const aim = o.aimX != null && o.aimY != null
    ? { x: ((o.aimX - cx) / s) * flipK, y: (o.aimY - groundY) / s }
    : null;

  // ── contact shadow ──
  ctx.save();
  ctx.globalAlpha = presence * 0.28 * (1 - jump / 60);
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(cx, groundY, 52 * s, 12 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = presence * exitEase;
  ctx.translate(cx, groundY - (26 + bob + jump) * s);
  ctx.scale(s * flipK, s);
  ctx.rotate((leanDeg * Math.PI) / 180);

  const bw = 118, bh = 98; // body box, bottom at y=0
  const topY = -bh;

  // ── arms (behind the body) ──
  const shL = { x: -bw / 2 + 6, y: topY + 46 };
  const shR = { x: bw / 2 - 6, y: topY + 46 };
  const armR = 9;

  // default rest pose
  let handL = { x: shL.x - 20, y: shL.y + 30 + Math.sin(t * 2.3 + 1) * 2 };
  let handR = { x: shR.x + 20, y: shR.y + 30 + Math.sin(t * 2.3) * 2 };

  if (o.action === 'wave') {
    const swing = Math.sin(t * 6.4) * 0.5;
    handR = { x: shR.x + 34 + Math.cos(swing) * 6, y: shR.y - 44 + Math.sin(swing) * 10 };
  } else if (o.action === 'celebrate') {
    const k = Math.abs(Math.sin(t * 4.6));
    handL = { x: shL.x - 28, y: shL.y - 40 - k * 12 };
    handR = { x: shR.x + 28, y: shR.y - 40 - k * 12 };
  } else if (o.action === 'point' && aim) {
    const ang = Math.atan2(aim.y - shR.y, aim.x - shR.x);
    const reach = 46 + Math.sin(t * 3) * 2;
    handR = { x: shR.x + Math.cos(ang) * reach, y: shR.y + Math.sin(ang) * reach };
  } else if (o.action === 'think') {
    handR = { x: shR.x - 14, y: topY - 6 }; // hand to chin
  } else if (o.action === 'shocked') {
    handL = { x: shL.x - 30, y: shL.y - 12 };
    handR = { x: shR.x + 30, y: shR.y - 12 };
  }

  limb(ctx, shL.x, shL.y, handL.x, handL.y, armR, BODY_DEEP);
  limb(ctx, shR.x, shR.y, handR.x, handR.y, armR, BODY_DEEP);
  ctx.fillStyle = ACCENT;
  ctx.beginPath(); ctx.arc(handL.x, handL.y, 10, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(handR.x, handR.y, 10, 0, Math.PI * 2); ctx.fill();

  // ── antenna ──
  const antSway = Math.sin(t * 3.1) * 4 + (o.action === 'celebrate' ? Math.sin(t * 12) * 3 : 0);
  ctx.strokeStyle = BODY_DEEP;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, topY + 4);
  ctx.quadraticCurveTo(antSway * 0.4, topY - 14, antSway, topY - 24);
  ctx.stroke();
  ctx.save();
  ctx.shadowColor = 'rgba(196,181,253,0.9)';
  ctx.shadowBlur = 12 + Math.sin(t * 4) * 4;
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.arc(antSway, topY - 28, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ── body ──
  const g = ctx.createLinearGradient(0, topY, 0, 0);
  g.addColorStop(0, BODY);
  g.addColorStop(1, BODY_DEEP);
  ctx.fillStyle = g;
  rr(ctx, -bw / 2, topY, bw, bh, 32);
  ctx.fill();
  // rim light
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-bw / 2 + 14, topY + 3);
  ctx.quadraticCurveTo(0, topY - 3, bw / 2 - 14, topY + 3);
  ctx.stroke();

  // ── face plate ──
  const fw = 88, fh = 56;
  const fx = -fw / 2, fy = topY + 16;
  ctx.fillStyle = FACE;
  rr(ctx, fx, fy, fw, fh, 20);
  ctx.fill();

  // eyes track the aim point
  const lookX = aim ? clamp(aim.x / 60, -1, 1) * 4 : Math.sin(t * 0.7) * 1.5;
  const lookY = aim ? clamp((aim.y + 80) / 80, -1, 1) * 3 : 0;
  // blink every ~2.8s (skip while shocked — eyes stay wide)
  const blinkCycle = t % 2.8;
  const blink = o.action === 'shocked' ? 1 : blinkCycle > 2.65 ? Math.max(0.12, 1 - Math.sin(((blinkCycle - 2.65) / 0.15) * Math.PI)) : 1;
  const eyeH = (o.action === 'shocked' ? 26 : o.action === 'think' ? 14 : 20) * blink;
  const eyeW = o.action === 'shocked' ? 13 : 11;
  const eyeY = fy + fh / 2 - eyeH / 2 + lookY;
  for (const sd of [-1, 1]) {
    ctx.save();
    ctx.shadowColor = 'rgba(233,246,255,0.65)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = EYE;
    rr(ctx, sd * 22 - eyeW / 2 + lookX, eyeY, eyeW, eyeH, 6);
    ctx.fill();
    ctx.restore();
  }

  // mouth
  ctx.strokeStyle = 'rgba(233,246,255,0.75)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  const mouthY = fy + fh - 12;
  ctx.beginPath();
  if (o.action === 'shocked') {
    ctx.arc(lookX * 0.5, mouthY - 2, 6, 0, Math.PI * 2);
  } else if (o.action === 'think') {
    ctx.moveTo(-8 + lookX, mouthY);
    ctx.lineTo(8 + lookX, mouthY);
  } else if (o.action === 'celebrate' || o.action === 'wave') {
    ctx.arc(lookX * 0.5, mouthY - 6, 9, Math.PI * 0.15, Math.PI * 0.85);
  } else {
    ctx.arc(lookX * 0.5, mouthY - 4, 7, Math.PI * 0.2, Math.PI * 0.8);
  }
  ctx.stroke();

  // ── action props ──
  if (o.action === 'think') {
    const pulse = 0.6 + Math.sin(t * 2.6) * 0.25;
    ctx.globalAlpha = presence * exitEase * pulse;
    ctx.font = '700 34px "JetBrains Mono", monospace';
    ctx.fillStyle = ACCENT;
    ctx.textAlign = 'center';
    ctx.fillText('?', 42, topY - 34 + Math.sin(t * 2.2) * 4);
    ctx.textAlign = 'left';
    ctx.globalAlpha = presence * exitEase;
  }

  ctx.restore();

  // ── confetti (celebrate) — drawn unflipped in frame space ──
  if (o.action === 'celebrate') {
    const N = 14;
    ctx.save();
    for (let i = 0; i < N; i++) {
      const cycle = 1.3;
      const born = i * (cycle / N);
      const age = ((t - born) % cycle + cycle) % cycle;
      const p = age / cycle;
      const ang = hash01(i * 17) * Math.PI - Math.PI; // upward half
      const speed = (120 + hash01(i * 31) * 160) * o.scale;
      const px = o.x + Math.cos(ang) * speed * p * 0.9;
      const py = o.y - 120 * o.scale + Math.sin(ang) * speed * p + 260 * p * p * o.scale;
      const colors = ['#a78bfa', '#34d399', '#fbbf24', '#f472b6', '#38bdf8'];
      ctx.save();
      ctx.globalAlpha = presence * exitEase * (1 - p) * 0.95;
      ctx.fillStyle = colors[i % colors.length];
      ctx.translate(px, py);
      ctx.rotate(p * 8 + i);
      ctx.fillRect(-4 * o.scale, -2.5 * o.scale, 8 * o.scale, 5 * o.scale);
      ctx.restore();
    }
    ctx.restore();
  }
}
