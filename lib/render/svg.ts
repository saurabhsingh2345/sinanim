// Whiteboard object pipeline: parse an imported SVG into flat polylines, then
// "draw it on" stroke-by-stroke with a marker (setLineDash-free — we build the
// revealed sub-path directly so we also get the pen-tip position for free).
//
// Everything here is a pure function of the reveal progress `p ∈ [0,1]`, so the
// whiteboard renderer stays deterministic and seek-safe like the rest of the
// engine. Supports <path> (M L H V C S Q T A Z), <line>, <rect>, <circle>,
// <ellipse>, <polygon>, <polyline> — the common subset real icon/illustration
// sets emit. Fills are ignored; line-art draws on as strokes.

export type Pt = [number, number];

export interface SubPath { pts: Pt[]; closed: boolean; fill: string | null; }
export interface ParsedSvg {
  vb: { x: number; y: number; w: number; h: number };
  subs: SubPath[];
  /** True when any sub carries a real fill — the renderer then does an
   *  outline-then-fill reveal instead of pure line-art. */
  hasFill: boolean;
}

// ── attribute helpers ──────────────────────────────────────────────────────────
function attrStr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i'));
  return m ? m[1] : null;
}
function attrNum(tag: string, name: string): number {
  const v = attrStr(tag, name);
  const n = v == null ? NaN : parseFloat(v);
  return isFinite(n) ? n : 0;
}

function parseViewBox(src: string): { x: number; y: number; w: number; h: number } {
  const svgTag = src.match(/<svg\b[^>]*>/i)?.[0] ?? '';
  const vb = attrStr(svgTag, 'viewBox');
  if (vb) {
    const p = vb.split(/[\s,]+/).map(Number).filter((n) => isFinite(n));
    if (p.length === 4) return { x: p[0], y: p[1], w: p[2] || 1, h: p[3] || 1 };
  }
  const w = attrNum(svgTag, 'width') || 100;
  const h = attrNum(svgTag, 'height') || 100;
  return { x: 0, y: 0, w, h };
}

// ── curve sampling ──────────────────────────────────────────────────────────────
function cubic(out: Pt[], x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) {
  const N = 16;
  for (let k = 1; k <= N; k++) {
    const t = k / N, u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    out.push([a * x0 + b * x1 + c * x2 + d * x3, a * y0 + b * y1 + c * y2 + d * y3]);
  }
}
function quad(out: Pt[], x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) {
  const N = 12;
  for (let k = 1; k <= N; k++) {
    const t = k / N, u = 1 - t;
    out.push([u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2]);
  }
}

// Endpoint → center parameterization arc, then sampled by angle (SVG spec impl).
function arc(out: Pt[], x0: number, y0: number, rx: number, ry: number, phiDeg: number, large: number, sweep: number, x: number, y: number) {
  if (rx === 0 || ry === 0) { out.push([x, y]); return; }
  rx = Math.abs(rx); ry = Math.abs(ry);
  const phi = (phiDeg * Math.PI) / 180;
  const cosP = Math.cos(phi), sinP = Math.sin(phi);
  const dx = (x0 - x) / 2, dy = (y0 - y) / 2;
  const x1p = cosP * dx + sinP * dy;
  const y1p = -sinP * dx + cosP * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
  const sign = large !== sweep ? 1 : -1;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = sign * Math.sqrt(Math.max(0, num / den));
  const cxp = (co * rx * y1p) / ry;
  const cyp = (-co * ry * x1p) / rx;
  const cx = cosP * cxp - sinP * cyp + (x0 + x) / 2;
  const cy = sinP * cxp + cosP * cyp + (y0 + y) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1;
    let a = Math.acos(Math.min(1, Math.max(-1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta0 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dtheta = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dtheta > 0) dtheta -= 2 * Math.PI;
  if (sweep && dtheta < 0) dtheta += 2 * Math.PI;
  const N = Math.max(6, Math.ceil((Math.abs(dtheta) / Math.PI) * 24));
  for (let k = 1; k <= N; k++) {
    const th = theta0 + (dtheta * k) / N;
    const ex = cosP * rx * Math.cos(th) - sinP * ry * Math.sin(th) + cx;
    const ey = sinP * rx * Math.cos(th) + cosP * ry * Math.sin(th) + cy;
    out.push([ex, ey]);
  }
}

// ── path `d` → polylines ─────────────────────────────────────────────────────────
type RawSub = { pts: Pt[]; closed: boolean };
function flattenPath(d: string): RawSub[] {
  const toks = d.match(/([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:[eE][-+]?\d+)?)/g) || [];
  const out: RawSub[] = [];
  let pts: Pt[] = [];
  let cx = 0, cy = 0, sx = 0, sy = 0;
  let lcx = 0, lcy = 0; // last cubic control (for S)
  let lqx = 0, lqy = 0; // last quad control (for T)
  let prev = '';
  let i = 0;
  const num = () => parseFloat(toks[i++]);
  const commit = (closed = false) => { if (pts.length > 1) out.push({ pts, closed }); pts = []; };

  while (i < toks.length) {
    let cmd = toks[i];
    if (/[A-Za-z]/.test(cmd)) i++;
    else cmd = prev === 'M' ? 'L' : prev === 'm' ? 'l' : prev; // implicit repeat
    if (!cmd) break;
    prev = cmd;
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'M') {
      let x = num(), y = num(); if (rel) { x += cx; y += cy; }
      commit(); pts = [[x, y]]; cx = x; cy = y; sx = x; sy = y;
    } else if (C === 'L') {
      let x = num(), y = num(); if (rel) { x += cx; y += cy; }
      pts.push([x, y]); cx = x; cy = y;
    } else if (C === 'H') {
      let x = num(); if (rel) x += cx; pts.push([x, cy]); cx = x;
    } else if (C === 'V') {
      let y = num(); if (rel) y += cy; pts.push([cx, y]); cy = y;
    } else if (C === 'C') {
      let x1 = num(), y1 = num(), x2 = num(), y2 = num(), x = num(), y = num();
      if (rel) { x1 += cx; y1 += cy; x2 += cx; y2 += cy; x += cx; y += cy; }
      cubic(pts, cx, cy, x1, y1, x2, y2, x, y); lcx = x2; lcy = y2; cx = x; cy = y;
    } else if (C === 'S') {
      let x2 = num(), y2 = num(), x = num(), y = num();
      if (rel) { x2 += cx; y2 += cy; x += cx; y += cy; }
      const x1 = /[CS]/.test(prevType) ? 2 * cx - lcx : cx;
      const y1 = /[CS]/.test(prevType) ? 2 * cy - lcy : cy;
      cubic(pts, cx, cy, x1, y1, x2, y2, x, y); lcx = x2; lcy = y2; cx = x; cy = y;
    } else if (C === 'Q') {
      let x1 = num(), y1 = num(), x = num(), y = num();
      if (rel) { x1 += cx; y1 += cy; x += cx; y += cy; }
      quad(pts, cx, cy, x1, y1, x, y); lqx = x1; lqy = y1; cx = x; cy = y;
    } else if (C === 'T') {
      let x = num(), y = num(); if (rel) { x += cx; y += cy; }
      const x1 = /[QT]/.test(prevType) ? 2 * cx - lqx : cx;
      const y1 = /[QT]/.test(prevType) ? 2 * cy - lqy : cy;
      quad(pts, cx, cy, x1, y1, x, y); lqx = x1; lqy = y1; cx = x; cy = y;
    } else if (C === 'A') {
      const rx = num(), ry = num(), rot = num(), large = num(), sweep = num(), x = (rel ? cx : 0) + num(), y = (rel ? cy : 0) + num();
      arc(pts, cx, cy, rx, ry, rot, large, sweep, x, y); cx = x; cy = y;
    } else if (C === 'Z') {
      if (pts.length) { pts.push([sx, sy]); commit(true); }
      cx = sx; cy = sy;
    }
    prevType = C;
  }
  commit();
  return out;
}
// `prevType` lives outside the loop turn so S/T can see the *previous command's*
// kind, not the one being reflected into.
let prevType = '';

// A normalized fill for a shape: the element's own `fill`, else the document
// default (root <svg> / a wrapping <g>). 'none'/absent → null (line-art only).
function fillOf(tag: string, rootFill: string | null): string | null {
  const f = attrStr(tag, 'fill');
  const v = f == null ? rootFill : f;
  return v && v.toLowerCase() !== 'none' ? v : null;
}

// ── parse whole SVG ──────────────────────────────────────────────────────────────
export function parseSvg(src: string): ParsedSvg {
  prevType = '';
  const vb = parseViewBox(src);
  const svgTag = src.match(/<svg\b[^>]*>/i)?.[0] ?? '';
  const gTag = src.match(/<g\b[^>]*>/i)?.[0] ?? '';
  // Root default fill (many icon sets set it once on <svg> or a <g> wrapper).
  const rootFill = fillOf(gTag, fillOf(svgTag, null));
  const subs: SubPath[] = [];

  for (const m of Array.from(src.matchAll(/<path\b[^>]*\bd\s*=\s*"([^"]*)"[^>]*>/gi))) {
    const fill = fillOf(m[0], rootFill);
    for (const sp of flattenPath(m[1])) subs.push({ ...sp, fill });
  }
  for (const m of Array.from(src.matchAll(/<line\b[^>]*>/gi))) {
    const a = m[0];
    subs.push({ pts: [[attrNum(a, 'x1'), attrNum(a, 'y1')], [attrNum(a, 'x2'), attrNum(a, 'y2')]], closed: false, fill: null });
  }
  for (const m of Array.from(src.matchAll(/<rect\b[^>]*>/gi))) {
    const a = m[0]; const x = attrNum(a, 'x'), y = attrNum(a, 'y'), w = attrNum(a, 'width'), h = attrNum(a, 'height');
    subs.push({ pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]], closed: true, fill: fillOf(a, rootFill) });
  }
  for (const m of Array.from(src.matchAll(/<(circle|ellipse)\b[^>]*>/gi))) {
    const a = m[0]; const cx = attrNum(a, 'cx'), cy = attrNum(a, 'cy');
    const rx = attrNum(a, 'rx') || attrNum(a, 'r'), ry = attrNum(a, 'ry') || attrNum(a, 'r');
    const pts: Pt[] = []; const N = 48;
    for (let k = 0; k <= N; k++) { const t = (k / N) * Math.PI * 2; pts.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]); }
    subs.push({ pts, closed: true, fill: fillOf(a, rootFill) });
  }
  for (const m of Array.from(src.matchAll(/<(polygon|polyline)\b[^>]*\bpoints\s*=\s*"([^"]*)"[^>]*>/gi))) {
    const nums = (m[2].match(/-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) || []).map(Number);
    const pts: Pt[] = [];
    for (let k = 0; k + 1 < nums.length; k += 2) pts.push([nums[k], nums[k + 1]]);
    if (m[1].toLowerCase() === 'polygon' && pts.length) pts.push(pts[0]);
    subs.push({ pts, closed: m[1].toLowerCase() === 'polygon', fill: fillOf(m[0], rootFill) });
  }
  return { vb, subs, hasFill: subs.some((s) => s.fill != null) };
}

// ── length + reveal ──────────────────────────────────────────────────────────────
export function polyLen(pts: Pt[]): number {
  let s = 0;
  for (let k = 1; k < pts.length; k++) s += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
  return s;
}

export interface StrokeOpts { color: string; width: number; shadow?: boolean; wobble?: number; taper?: boolean }

// Pen-pressure profile along a stroke: eases up from a thin start, rides full
// through the middle, tapers at the end — the single biggest "hand-drawn" tell.
function pressure(f: number): number {
  const up = Math.min(1, f / 0.14);          // quick ramp-in
  const down = Math.min(1, (1 - f) / 0.22);  // gentle taper-out
  return 0.5 + 0.5 * Math.min(up, down);     // 0.5 → 1.0 → thinner ends
}

/** Stroke `polys` as ONE continuous draw revealed to `p`, returning the pen tip
 *  (leading edge). With `taper`, each poly is drawn as pressure-varied ink for a
 *  confident hand-drawn line instead of a flat uniform stroke. */
export function strokePathsReveal(ctx: CanvasRenderingContext2D, polys: Pt[][], p: number, opts: StrokeOpts): Pt | null {
  const clamped = Math.max(0, Math.min(1, p));
  const lens = polys.map(polyLen);
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  let target = clamped * total;
  let pen: Pt | null = null;

  ctx.save();
  ctx.strokeStyle = opts.color;
  ctx.lineWidth = opts.width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (opts.shadow) { ctx.shadowColor = 'rgba(20,24,34,0.10)'; ctx.shadowBlur = opts.width * 1.4; ctx.shadowOffsetY = opts.width * 0.4; }

  for (let pi = 0; pi < polys.length && target > 0.0001; pi++) {
    const pts = polys[pi];
    if (pts.length < 2) continue;
    const L = lens[pi] || 1;
    let drawn = 0; let broke = false;

    if (opts.taper) {
      // per-segment ink: width follows the pressure profile along this poly
      for (let k = 1; k < pts.length; k++) {
        const dx = pts[k][0] - pts[k - 1][0], dy = pts[k][1] - pts[k - 1][1];
        const seg = Math.hypot(dx, dy);
        const use = Math.min(seg, target - drawn);
        if (use <= 0) { broke = true; break; }
        const f = (target - drawn) / (seg || 1);
        const ex = use < seg ? pts[k - 1][0] + dx * f : pts[k][0];
        const ey = use < seg ? pts[k - 1][1] + dy * f : pts[k][1];
        ctx.lineWidth = opts.width * pressure((drawn + use * 0.5) / L);
        ctx.beginPath(); ctx.moveTo(pts[k - 1][0], pts[k - 1][1]); ctx.lineTo(ex, ey); ctx.stroke();
        drawn += use; pen = [ex, ey];
        if (use < seg) { broke = true; break; }
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) {
        const dx = pts[k][0] - pts[k - 1][0], dy = pts[k][1] - pts[k - 1][1];
        const seg = Math.hypot(dx, dy);
        if (drawn + seg <= target) {
          ctx.lineTo(pts[k][0], pts[k][1]); drawn += seg; pen = [pts[k][0], pts[k][1]];
        } else {
          const f = (target - drawn) / (seg || 1);
          const ex = pts[k - 1][0] + dx * f, ey = pts[k - 1][1] + dy * f;
          ctx.lineTo(ex, ey); pen = [ex, ey]; broke = true; break;
        }
      }
      ctx.stroke();
    }
    target -= L;
    if (broke) break;
  }
  ctx.restore();
  return pen;
}

/** Draw an imported SVG object centered at `place`, sized so its longest side is
 *  `place.size` px, revealed to `p`. Line-art draws on as strokes; filled shapes
 *  get an outline-then-fill cascade (the fill fades in just after its outline
 *  finishes). Returns the pen tip in screen px. */
export function drawSvgObject(
  ctx: CanvasRenderingContext2D,
  parsed: ParsedSvg,
  place: { x: number; y: number; size: number },
  p: number,
  opts: StrokeOpts,
): Pt | null {
  const s = place.size / Math.max(parsed.vb.w, parsed.vb.h, 1);
  const ox = parsed.vb.x + parsed.vb.w / 2;
  const oy = parsed.vb.y + parsed.vb.h / 2;
  const polys: Pt[][] = parsed.subs.map((sp) =>
    sp.pts.map(([X, Y]) => [place.x + (X - ox) * s, place.y + (Y - oy) * s] as Pt),
  );

  // Outline-then-fill: for filled objects the stroke draws over the first 70% of
  // the reveal, and each sub's fill fades in just after ITS outline completes —
  // a coloring-book cascade. Line-art (no fills) strokes over the full window.
  const outlineP = parsed.hasFill ? Math.min(1, p / 0.7) : p;
  if (parsed.hasFill) {
    const lens = polys.map(polyLen);
    const total = lens.reduce((a, b) => a + b, 0) || 1;
    let cum = 0;
    ctx.save();
    for (let i = 0; i < polys.length; i++) {
      const outlineDone = (0.7 * (cum + lens[i])) / total; // p at which this sub's outline finishes
      cum += lens[i];
      const fill = parsed.subs[i].fill;
      if (!fill || polys[i].length < 3) continue;
      const a = Math.max(0, Math.min(1, (p - outlineDone - 0.03) / 0.2));
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(polys[i][0][0], polys[i][0][1]);
      for (let k = 1; k < polys[i].length; k++) ctx.lineTo(polys[i][k][0], polys[i][k][1]);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  return strokePathsReveal(ctx, polys, outlineP, opts);
}
