// Whiteboard / explainer-animation card: a clean board onto which hand-written
// text, imported SVG objects, and sketched annotations are "drawn on" by a sleek
// marker, beat by beat. Objects come from public/objects/*.svg (parsed in
// lib/render/svg.ts). Timing is a pure function of scene time, distributed across
// the (narration-stretched) duration, so preview and export agree.
import { WhiteboardScene, BoardElement, BoardStep, BoardStyle } from '../types';
import type { Prepared } from '../renderer';
import { clamp } from '../utils';
import { envelope } from '../motion';
import { FocusTarget } from '../camera';
import { cardAlpha } from './shared';
import { ParsedSvg, Pt, drawSvgObject, strokePathsReveal } from './svg';
import { buildStoryboard, sampleTrack, activeMove, activeForce, ForceCue } from '../whiteboard/motion';

const HAND = "'Caveat', 'Comic Sans MS', cursive";

interface Board { bg: string; ink: string; grid: string | null; }
function boardOf(style: BoardStyle): Board {
  switch (style) {
    case 'blackboard': return { bg: '#20262b', ink: '#f2f0e9', grid: null };
    case 'paper': return { bg: '#f6f3ea', ink: '#233a52', grid: 'rgba(60,90,130,0.10)' };
    default: return { bg: '#f7f5ef', ink: '#2b2b31', grid: null };
  }
}

// ── board backdrop ───────────────────────────────────────────────────────────────
function drawBoard(ctx: CanvasRenderingContext2D, b: Board, W: number, H: number) {
  ctx.save();
  ctx.fillStyle = b.bg;
  ctx.fillRect(0, 0, W, H);
  // faint ruled lines for the paper variant
  if (b.grid) {
    ctx.strokeStyle = b.grid; ctx.lineWidth = 1;
    const gap = Math.round(H / 22);
    for (let y = gap; y < H; y += gap) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  }
  // soft vignette for depth
  const g = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, b.bg === '#20262b' ? 'rgba(0,0,0,0.30)' : 'rgba(60,55,40,0.09)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// ── hand-written text, revealed left→right ───────────────────────────────────────
function drawText(ctx: CanvasRenderingContext2D, el: Extract<BoardElement, { kind: 'text' }>, p: number, W: number, H: number, rs: number, ink: string): Pt | null {
  const fs = (el.size || 40) * rs;
  const color = el.color || ink;
  const lines = el.text.split('\n');
  const lh = fs * 1.3;
  ctx.save();
  ctx.font = `700 ${fs}px ${HAND}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const widths = lines.map((l) => ctx.measureText(l).width);
  const total = widths.reduce((a, w) => a + w, 0) || 1;
  const cx = el.at[0] * W, cy = el.at[1] * H;
  const blockH = lines.length * lh;
  const top = cy - blockH / 2;
  let target = clamp(p, 0, 1) * total;
  let pen: Pt | null = null;
  for (let i = 0; i < lines.length; i++) {
    const w = widths[i];
    if (target <= 0) break;
    const x = cx - w / 2;
    const baseline = top + i * lh + fs * 0.82;
    const rev = Math.min(w, target);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 3, baseline - fs, rev + 4, fs * 1.4);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.shadowColor = 'rgba(15,20,30,0.10)'; ctx.shadowBlur = 3 * rs; ctx.shadowOffsetY = 1.5 * rs;
    ctx.fillText(lines[i], x, baseline);
    ctx.restore();
    if (rev < w) { pen = [x + rev, baseline - fs * 0.35]; break; }
    pen = [x + w, baseline - fs * 0.35];
    target -= w;
  }
  ctx.restore();
  return pen;
}

// ── sketched annotations (arrow / underline / box / circle) ───────────────────────
function wobble(pts: Pt[], amp: number): Pt[] {
  return pts.map(([x, y], i) => {
    const h = Math.sin((x * 0.7 + y * 1.3 + i * 2.1)) * 43758.5453;
    const jx = ((h % 1) - 0.5) * 2 * amp;
    const jy = (((h * 1.7) % 1) - 0.5) * 2 * amp;
    return [x + jx, y + jy] as Pt;
  });
}

function arrowhead(ctx: CanvasRenderingContext2D, tail: Pt, tip: Pt, p: number, rs: number, color: string) {
  if (p <= 0.82) return;
  const ang = Math.atan2(tip[1] - tail[1], tip[0] - tail[0]);
  const hl = 16 * rs;
  const head: Pt[][] = [
    [[tip[0] - Math.cos(ang - 0.5) * hl, tip[1] - Math.sin(ang - 0.5) * hl], tip],
    [[tip[0] - Math.cos(ang + 0.5) * hl, tip[1] - Math.sin(ang + 0.5) * hl], tip],
  ];
  strokePathsReveal(ctx, head, clamp((p - 0.82) / 0.18, 0, 1), { color, width: 4 * rs, shadow: true, taper: true });
}

function drawAnnot(ctx: CanvasRenderingContext2D, el: Extract<BoardElement, { kind: 'arrow' | 'underline' | 'box' | 'circle' | 'highlight' | 'curve' }>, p: number, W: number, H: number, rs: number, color: string): Pt | null {
  const width = 4 * rs;
  const A: Pt = [(el.from?.[0] ?? 0.4) * W, (el.from?.[1] ?? 0.5) * H];
  const B: Pt = [(el.to?.[0] ?? 0.6) * W, (el.to?.[1] ?? 0.5) * H];
  // translucent marker swipe — behind-the-text emphasis, drawn as a fat band
  if (el.kind === 'highlight') {
    ctx.save();
    ctx.globalAlpha *= 0.34;
    const pen = strokePathsReveal(ctx, [[A, B]], p, { color: el.color || '#ffd23f', width: 26 * rs });
    ctx.restore();
    return pen;
  }
  // gently bowed arrow: a quadratic through a control point offset from the chord
  if (el.kind === 'curve') {
    const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
    const dx = B[0] - A[0], dy = B[1] - A[1];
    const bow = 0.22; // perpendicular bulge
    const cxp = mx - dy * bow, cyp = my + dx * bow;
    const pts: Pt[] = []; const N = 28;
    for (let k = 0; k <= N; k++) { const t = k / N, u = 1 - t; pts.push([u * u * A[0] + 2 * u * t * cxp + t * t * B[0], u * u * A[1] + 2 * u * t * cyp + t * t * B[1]]); }
    const pen = strokePathsReveal(ctx, [pts], p, { color, width, shadow: true, taper: true });
    arrowhead(ctx, pts[N - 1], B, p, rs, color);
    return pen;
  }
  let polys: Pt[][] = [];
  if (el.kind === 'arrow' || el.kind === 'underline') {
    polys = [[A, B]];
  } else if (el.kind === 'box') {
    const x0 = Math.min(A[0], B[0]), y0 = Math.min(A[1], B[1]), x1 = Math.max(A[0], B[0]), y1 = Math.max(A[1], B[1]);
    polys = [wobble([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]], 1.6 * rs)];
  } else { // circle / ellipse around the from→to box
    const cx = (A[0] + B[0]) / 2, cy = (A[1] + B[1]) / 2;
    const rx = Math.max(20 * rs, Math.abs(B[0] - A[0]) / 2), ry = Math.max(16 * rs, Math.abs(B[1] - A[1]) / 2);
    const pts: Pt[] = [];
    const N = 40;
    for (let k = 0; k <= N; k++) { const t = (k / N) * Math.PI * 2 - 0.4; pts.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]); }
    polys = [wobble(pts, 1.4 * rs)];
  }
  const pen = strokePathsReveal(ctx, polys, p, { color, width, shadow: true, taper: true });
  if (el.kind === 'arrow') arrowhead(ctx, A, B, p, rs, color);
  return pen;
}

// ── point-anchored marks: a hand-flicked tick or cross ────────────────────────────
function drawMark(ctx: CanvasRenderingContext2D, el: Extract<BoardElement, { kind: 'check' | 'cross' }>, p: number, W: number, H: number, rs: number): Pt | null {
  const cx = el.at[0] * W, cy = el.at[1] * H;
  const s = 26 * rs;
  const polys: Pt[][] = el.kind === 'check'
    ? [[[cx - s, cy], [cx - s * 0.25, cy + s * 0.7], [cx + s, cy - s * 0.8]]]
    : [[[cx - s * 0.8, cy - s * 0.8], [cx + s * 0.8, cy + s * 0.8]], [[cx + s * 0.8, cy - s * 0.8], [cx - s * 0.8, cy + s * 0.8]]];
  return strokePathsReveal(ctx, polys, p, { color: el.color || (el.kind === 'check' ? '#3aa76d' : '#d1495b'), width: 5 * rs, shadow: true, taper: true });
}

// ── the sleek marker/pen ─────────────────────────────────────────────────────────
function drawPen(ctx: CanvasRenderingContext2D, x: number, y: number, rs: number, ink: string) {
  const L = 130 * rs;
  const dx = 0.5, dy = -0.866; // up-right
  const bx = x + dx * L, by = y + dy * L; // butt end
  const nx = x + dx * (16 * rs), ny = y + dy * (16 * rs); // nib base
  ctx.save();
  // barrel
  ctx.strokeStyle = '#3a3a44';
  ctx.lineWidth = 15 * rs; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(bx, by); ctx.stroke();
  // ink-colored grip band near the nib
  ctx.strokeStyle = ink;
  ctx.lineWidth = 15 * rs;
  ctx.beginPath(); ctx.moveTo(nx, ny); ctx.lineTo(x + dx * (44 * rs), y + dy * (44 * rs)); ctx.stroke();
  // highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 3 * rs;
  ctx.beginPath();
  ctx.moveTo(nx - dy * 4 * rs, ny + dx * 4 * rs);
  ctx.lineTo(bx - dy * 4 * rs, by + dx * 4 * rs);
  ctx.stroke();
  // nib
  const perp: Pt = [-dy, dx];
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(nx + perp[0] * 6 * rs, ny + perp[1] * 6 * rs);
  ctx.lineTo(nx - perp[0] * 6 * rs, ny - perp[1] * 6 * rs);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ── timeline: each STEP lands with its narration; its elements draw within ────────
interface TItem { el: BoardElement; start: number; dur: number; }
function defaultDraw(el: BoardElement): number {
  if (el.kind === 'text') return clamp(0.5 + el.text.replace(/\n/g, '').length * 0.03, 0.7, 3.4);
  if (el.kind === 'object') return 1.8;
  return 0.7;
}

function sceneWindow(scene: WhiteboardScene): number {
  return Math.min(scene.narrationDuration ?? scene.duration, scene.duration);
}

/** Scene-relative start of each step: voice-synced when the narration pipeline
 *  measured it, otherwise weighted by how much the step says + how much it draws. */
function stepStarts(scene: WhiteboardScene): number[] {
  const window = sceneWindow(scene);
  const n = scene.steps.length;
  if (scene.stepNarrationTimes && scene.stepNarrationTimes.length === n) {
    const cap = Math.max(window - 0.2, 0.2);
    const times = scene.stepNarrationTimes.slice();
    for (let i = n - 1; i >= 0; i--) { const ceil = cap - (n - 1 - i) * 0.12; if (times[i] > ceil) times[i] = Math.max(0, ceil); }
    for (let i = 1; i < n; i++) if (times[i] < times[i - 1] + 0.05) times[i] = times[i - 1] + 0.05;
    return times;
  }
  const usable = Math.max(window - 0.4, 0.6);
  const weight = (st: BoardStep) => Math.max(0.6, st.narration ? st.narration.trim().length / 42 : 0, st.add.length * 0.5);
  const sum = scene.steps.reduce((a, st) => a + weight(st), 0) || 1;
  let t = 0.25;
  return scene.steps.map((st) => { const at = t; t += (weight(st) / sum) * usable; return at; });
}

function layoutTimeline(scene: WhiteboardScene): TItem[] {
  const starts = stepStarts(scene);
  const window = sceneWindow(scene);
  const items: TItem[] = [];
  for (let si = 0; si < scene.steps.length; si++) {
    const st = scene.steps[si];
    const s0 = starts[si];
    const s1 = si + 1 < starts.length ? starts[si + 1] : window;
    const win = Math.max(0.4, s1 - s0);
    const durs = st.add.map((e) => e.draw ?? defaultDraw(e));
    const GAP = 0.15;
    const natural = durs.reduce((a, b) => a + b, 0) + GAP * Math.max(0, durs.length - 1);
    const sc = natural > 0 ? clamp((win * 0.92) / natural, 0.35, 1.6) : 1;
    let t = s0;
    for (let ei = 0; ei < st.add.length; ei++) {
      items.push({ el: st.add[ei], start: t, dur: Math.max(0.25, durs[ei] * sc) });
      t += durs[ei] * sc + GAP * sc;
    }
  }
  return items;
}

function elementCenter(el: BoardElement, W: number, H: number): Pt {
  if ('at' in el) return [el.at[0] * W, el.at[1] * H];
  const a = el.from ?? [0.5, 0.5], b = el.to ?? a;
  return [((a[0] + b[0]) / 2) * W, ((a[1] + b[1]) / 2) * H];
}

/** Gentle camera glide toward the region the active step is drawing (fed to the
 *  shared virtual camera in renderFrame). Calm — one move per step, not per stroke. */
export function whiteboardFocus(scene: WhiteboardScene, time: number, W: number, H: number): FocusTarget | null {
  const local = time - scene.startTime;
  const starts = stepStarts(scene);
  const window = sceneWindow(scene);
  let si = -1;
  for (let i = 0; i < starts.length; i++) if (local >= starts[i] - 1e-6) si = i;
  if (si < 0) return null;
  const st = scene.steps[si];
  if (!st.add.length) return null;
  let sx = 0, sy = 0;
  for (const el of st.add) { const c = elementCenter(el, W, H); sx += c[0]; sy += c[1]; }
  const cx = sx / st.add.length, cy = sy / st.add.length;
  const s1 = si + 1 < starts.length ? starts[si + 1] : window;
  const strength = envelope(local, starts[si], s1, 0.6, 0.7) * 0.5;
  if (strength <= 0.001) return null;
  return { x: cx, y: cy, zoom: 1.12, strength };
}

function objPlace(el: Extract<BoardElement, { kind: 'object' }>, W: number, H: number) {
  const base = Math.min(W, H) * 0.24;
  return { x: el.at[0] * W, y: el.at[1] * H, size: base * (el.scale || 1) };
}

function drawMissing(ctx: CanvasRenderingContext2D, el: Extract<BoardElement, { kind: 'object' }>, W: number, H: number, rs: number, ink: string, p: number) {
  const pl = objPlace(el, W, H);
  const h = pl.size / 2;
  const box: Pt[][] = [[[pl.x - h, pl.y - h], [pl.x + h, pl.y - h], [pl.x + h, pl.y + h], [pl.x - h, pl.y + h], [pl.x - h, pl.y - h]]];
  strokePathsReveal(ctx, box, p, { color: ink, width: 3 * rs });
}

const DIRV: Record<string, Pt> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

// short speed lines trailing a moving actor, in the direction it came from
function drawMotionLines(ctx: CanvasRenderingContext2D, px: number, py: number, ux: number, uy: number, size: number, rs: number, ink: string) {
  const back = size * 0.58, perp: Pt = [-uy, ux];
  ctx.save();
  ctx.strokeStyle = ink; ctx.globalAlpha *= 0.5; ctx.lineWidth = 3 * rs; ctx.lineCap = 'round';
  for (const off of [-0.3, 0, 0.3]) {
    const ox = px - ux * back + perp[0] * size * off, oy = py - uy * back + perp[1] * size * off;
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox - ux * size * 0.5, oy - uy * size * 0.5); ctx.stroke();
  }
  ctx.restore();
}

// a red force arrow approaching the actor from behind (anticipation of a push)
function drawForceArrow(ctx: CanvasRenderingContext2D, px: number, py: number, f: ForceCue, t: number, size: number, rs: number) {
  const [dx, dy] = DIRV[f.dir] ?? [1, 0];
  const p = clamp((t - f.t0) / Math.max(0.2, f.t1 - f.t0), 0, 1);
  const s: Pt = [px - dx * size * 1.15, py - dy * size * 1.15];
  const e: Pt = [px - dx * size * 0.62, py - dy * size * 0.62];
  const cur: Pt = [s[0] + (e[0] - s[0]) * p, s[1] + (e[1] - s[1]) * p];
  strokePathsReveal(ctx, [[s, cur]], 1, { color: '#d1495b', width: 6 * rs, shadow: true });
  if (p > 0.5) {
    const ang = Math.atan2(dy, dx), hl = 15 * rs;
    strokePathsReveal(ctx, [[[cur[0] - Math.cos(ang - 0.5) * hl, cur[1] - Math.sin(ang - 0.5) * hl], cur], [[cur[0] - Math.cos(ang + 0.5) * hl, cur[1] - Math.sin(ang + 0.5) * hl], cur]], clamp((p - 0.5) / 0.5, 0, 1), { color: '#d1495b', width: 6 * rs });
  }
  ctx.save();
  ctx.globalAlpha *= clamp(p * 1.5, 0, 1);
  ctx.font = `700 ${28 * rs}px ${HAND}`; ctx.fillStyle = '#d1495b'; ctx.textAlign = 'center';
  ctx.fillText('force', s[0] - dx * 18 * rs, s[1] - dy * 18 * rs);
  ctx.restore();
}

// ── story mode: persistent actors that MOVE, beat by beat ─────────────────────────
function drawStoryboard(ctx: CanvasRenderingContext2D, prep: Prepared, scene: WhiteboardScene, time: number, W: number, H: number) {
  const rs = H / 1080;
  const b = boardOf(scene.board || 'white');
  const idx = prep.dsl.scenes.indexOf(scene);
  const svgs: Map<string, ParsedSvg> | undefined = prep.svgObjects?.get(idx);
  const local = time - scene.startTime;

  drawBoard(ctx, b, W, H);
  ctx.save();
  ctx.globalAlpha *= cardAlpha(scene, time, 0.4);

  const starts = stepStarts(scene);
  const win = sceneWindow(scene);
  const sb = buildStoryboard(scene.actors ?? [], scene.steps, starts, win);
  let penTip: Pt | null = null;

  for (const track of sb.tracks) {
    const s = sampleTrack(track.kfs, local);
    if (!s.visible) continue;
    const size = Math.min(W, H) * 0.24 * s.scale;
    const px = s.x * W, py = s.y * H;
    ctx.save();
    ctx.globalAlpha *= clamp(s.opacity, 0, 1);
    if (activeMove(sb.moves, track.id, local)) {
      const prev = sampleTrack(track.kfs, local - 0.06);
      const vx = (s.x - prev.x) * W, vy = (s.y - prev.y) * H, L = Math.hypot(vx, vy);
      if (L > 1.2) drawMotionLines(ctx, px, py, vx / L, vy / L, size, rs, b.ink);
    }
    const parsed = track.icon ? svgs?.get(track.icon) : undefined;
    if (parsed) {
      const tip = drawSvgObject(ctx, parsed, { x: px, y: py, size }, s.drawP, { color: b.ink, width: 4.0 * rs, shadow: true, taper: true });
      if (s.drawP < 1) penTip = tip;
    } else {
      drawMissing(ctx, { kind: 'object', src: '', at: [s.x, s.y], scale: s.scale }, W, H, rs, b.ink, s.drawP);
    }
    if (track.label && s.drawP > 0.4) {
      drawText(ctx, { kind: 'text', text: track.label, at: [s.x, clamp(s.y + 0.12 * s.scale + 0.05, 0, 0.96)], size: 38 }, clamp((s.drawP - 0.4) / 0.6, 0, 1), W, H, rs, b.ink);
    }
    ctx.restore();
    const f = activeForce(sb.forces, track.id, local);
    if (f) drawForceArrow(ctx, px, py, f, local, size, rs);
  }

  // notes + annotations authored on beats (fade out when a later `clear` retires them)
  for (const m of sb.marks) {
    if (local < m.t0) continue;
    let fadeA = 1;
    if (m.fade != null) { if (local > m.fade + 0.45) continue; if (local > m.fade) fadeA = 1 - (local - m.fade) / 0.45; }
    const p = clamp((local - m.t0) / Math.max(0.4, (m.t1 - m.t0) * 0.8), 0, 1);
    const act = m.action;
    ctx.save();
    ctx.globalAlpha *= fadeA;
    if (act.act === 'note') drawText(ctx, { kind: 'text', text: act.text, at: act.at, size: act.size || 36, color: act.color }, p, W, H, rs, b.ink);
    else if (act.act === 'mark') {
      if (act.kind === 'check' || act.kind === 'cross') drawMark(ctx, { kind: act.kind, at: act.at || [0.5, 0.5], color: act.color }, p, W, H, rs);
      else drawAnnot(ctx, { kind: act.kind, from: act.from, to: act.to, color: act.color }, p, W, H, rs, act.color || b.ink);
    }
    ctx.restore();
  }

  if (scene.pen !== false && penTip) drawPen(ctx, penTip[0], penTip[1], rs, b.ink);
  ctx.restore();
}

export function drawWhiteboardCard(ctx: CanvasRenderingContext2D, prep: Prepared, scene: WhiteboardScene, time: number, W: number, H: number) {
  if (scene.actors && scene.actors.length) return drawStoryboard(ctx, prep, scene, time, W, H);
  const rs = H / 1080;
  const b = boardOf(scene.board || 'white');
  const alpha = cardAlpha(scene, time, 0.4);
  const idx = prep.dsl.scenes.indexOf(scene);
  const svgs: Map<string, ParsedSvg> | undefined = prep.svgObjects?.get(idx);
  const local = time - scene.startTime;

  drawBoard(ctx, b, W, H);

  ctx.save();
  ctx.globalAlpha *= alpha;
  const timeline = layoutTimeline(scene);
  let pen: Pt | null = null;
  let penColor = b.ink;
  for (const it of timeline) {
    const p = (local - it.start) / Math.max(it.dur, 0.001);
    if (p <= 0) continue;
    const cp = clamp(p, 0, 1);
    const el = it.el;
    const color = (el as { color?: string }).color || b.ink;
    let tip: Pt | null = null;
    if (el.kind === 'text') tip = drawText(ctx, el, cp, W, H, rs, b.ink);
    else if (el.kind === 'object') {
      const parsed = svgs?.get(el.src);
      if (parsed) tip = drawSvgObject(ctx, parsed, objPlace(el, W, H), cp, { color, width: 4.0 * rs, shadow: true, taper: true });
      else drawMissing(ctx, el, W, H, rs, b.ink, cp);
    } else if (el.kind === 'check' || el.kind === 'cross') tip = drawMark(ctx, el, cp, W, H, rs);
    else if (el.kind === 'arrow' || el.kind === 'underline' || el.kind === 'box' || el.kind === 'circle' || el.kind === 'highlight' || el.kind === 'curve') tip = drawAnnot(ctx, el, cp, W, H, rs, color);
    if (p < 1 && tip) { pen = tip; penColor = color; }
  }
  if (scene.pen !== false && pen) drawPen(ctx, pen[0], pen[1], rs, penColor);
  ctx.restore();
}
