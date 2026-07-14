// Motion engine for story-mode whiteboards: turn a scene's actors + per-beat
// actions into per-actor KEYFRAME TRACKS over scene time, then sample each track
// per frame. Follows the classic principles — slow-in/slow-out (easing),
// anticipation (a wind-up before a push), motion lines, squash on impact — so
// objects feel alive instead of just stroke-drawing in place.
import { WBActor, WBAction, WBEase, WBDir, BoardStep } from '../types';

export interface Keyframe { t: number; x: number; y: number; scale: number; opacity: number; drawP: number; ease: WBEase; }
export interface MotionInterval { id: string; t0: number; t1: number; }        // when an actor is sliding
export interface ForceCue { id: string; t0: number; t1: number; dir: WBDir; }
export interface BeatMark { t0: number; t1: number; action: WBAction; fade?: number; } // note/mark; fade = when it clears
export interface Track { id: string; icon?: string; box?: string; label?: string; kfs: Keyframe[]; }
export interface Storyboard { tracks: Track[]; moves: MotionInterval[]; forces: ForceCue[]; marks: BeatMark[]; }

const EASE: Record<WBEase, (p: number) => number> = {
  linear: (p) => p,
  smooth: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),   // easeInOutCubic
  accelerate: (p) => p * p,                                                     // easeInQuad — gathers speed
  decelerate: (p) => 1 - (1 - p) * (1 - p),                                     // easeOutQuad — coasts to stop
  bounce: (p) => { const n = 7.5625, d = 2.75; if (p < 1 / d) return n * p * p; if (p < 2 / d) { p -= 1.5 / d; return n * p * p + 0.75; } if (p < 2.5 / d) { p -= 2.25 / d; return n * p * p + 0.9375; } p -= 2.625 / d; return n * p * p + 0.984375; },
  anticipate: (p) => { const s = 1.70158; return p * p * ((s + 1) * p - s); },  // slight wind-back then go
};

const R2 = Math.SQRT1_2;
const DIR: Record<string, [number, number]> = {
  left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1],
  'up-left': [-R2, -R2], 'up-right': [R2, -R2], 'down-left': [-R2, R2], 'down-right': [R2, R2],
};

/** Build per-actor keyframe tracks from the beat timeline. `starts[i]` is the
 *  scene-relative start of beat i (already narration-synced upstream). */
export function buildStoryboard(actors: WBActor[], steps: BoardStep[], starts: number[], sceneEnd: number): Storyboard {
  const tracks = new Map<string, Track>();
  for (const a of actors) tracks.set(a.id, { id: a.id, icon: a.icon, box: a.box, label: a.label, kfs: [] });
  // live transform per actor as we walk the beats
  const cur = new Map<string, { x: number; y: number; scale: number; opacity: number; shown: boolean }>();
  for (const a of actors) cur.set(a.id, { x: a.at[0], y: a.at[1], scale: a.scale ?? 1, opacity: 1, shown: false });

  const moves: MotionInterval[] = [];
  const forces: ForceCue[] = [];
  const marks: BeatMark[] = [];
  const push = (id: string, kf: Keyframe) => tracks.get(id)?.kfs.push(kf);

  for (let bi = 0; bi < steps.length; bi++) {
    const t0 = starts[bi] ?? 0;
    const t1 = bi + 1 < starts.length ? starts[bi + 1] : sceneEnd;
    const win = Math.max(0.5, t1 - t0);
    const acts = steps[bi].do ?? [];
    // multiple actions in a beat share the window sequentially
    const n = Math.max(1, acts.length);
    acts.forEach((action, ai) => {
      const a0 = t0 + (win * ai) / n;
      const a1 = t0 + (win * (ai + 1)) / n;
      applyAction(action, a0, a1, cur, push, moves, forces, marks);
    });
    if (!acts.length) { /* narration-only beat: hold */ }
  }
  // ensure every shown actor has a trailing keyframe at sceneEnd (hold last state)
  cur.forEach((c, id) => { if (c.shown) push(id, { t: sceneEnd, x: c.x, y: c.y, scale: c.scale, opacity: c.opacity, drawP: 1, ease: 'linear' }); });
  return { tracks: Array.from(tracks.values()), moves, forces, marks };
}

function applyAction(
  action: WBAction, a0: number, a1: number,
  cur: Map<string, { x: number; y: number; scale: number; opacity: number; shown: boolean }>,
  push: (id: string, kf: Keyframe) => void,
  moves: MotionInterval[], forces: ForceCue[], marks: BeatMark[],
) {
  if (action.act === 'note' || action.act === 'mark') { marks.push({ t0: a0, t1: a1, action }); return; }
  if (action.act === 'clear') {
    // wipe finished elements so nothing new draws over stale content
    const only = action.ids && action.ids.length ? new Set(action.ids) : null;
    cur.forEach((c, id) => {
      if (c.shown && (!only || only.has(id))) {
        push(id, { t: a0, x: c.x, y: c.y, scale: c.scale, opacity: c.opacity, drawP: 1, ease: 'linear' });
        push(id, { t: a0 + Math.min(0.45, a1 - a0), x: c.x, y: c.y, scale: c.scale, opacity: 0, drawP: 1, ease: 'smooth' });
        c.opacity = 0; c.shown = false;
      }
    });
    for (const m of marks) if (m.fade == null && m.t0 <= a0) m.fade = a0;    // fade earlier notes/marks
    return;
  }
  const c = cur.get(action.id);
  if (!c) return;
  const drawDur = Math.min(1.2, a1 - a0);

  switch (action.act) {
    case 'draw': {
      c.shown = true;
      push(action.id, { t: a0, x: c.x, y: c.y, scale: c.scale, opacity: 1, drawP: 0, ease: 'linear' });
      push(action.id, { t: a0 + drawDur, x: c.x, y: c.y, scale: c.scale, opacity: 1, drawP: 1, ease: 'smooth' });
      break;
    }
    case 'appear': {
      c.shown = true;
      push(action.id, { t: a0, x: c.x, y: c.y, scale: c.scale, opacity: 0, drawP: 1, ease: 'linear' });
      push(action.id, { t: a0 + Math.min(0.5, a1 - a0), x: c.x, y: c.y, scale: c.scale, opacity: 1, drawP: 1, ease: 'decelerate' });
      break;
    }
    case 'fade': {
      push(action.id, { t: a0, x: c.x, y: c.y, scale: c.scale, opacity: c.opacity, drawP: 1, ease: 'linear' });
      push(action.id, { t: a1, x: c.x, y: c.y, scale: c.scale, opacity: 0, drawP: 1, ease: 'smooth' });
      c.opacity = 0; c.shown = false;
      break;
    }
    case 'move': {
      const [tx, ty] = action.to;
      push(action.id, { t: a0, x: c.x, y: c.y, scale: c.scale, opacity: c.opacity, drawP: 1, ease: 'linear' });
      if (action.arc) { // bowed path via an apex keyframe
        const tm = (a0 + a1) / 2;
        push(action.id, { t: tm, x: (c.x + tx) / 2, y: Math.min(c.y, ty) - 0.14, scale: c.scale, opacity: c.opacity, drawP: 1, ease: 'decelerate' });
      }
      push(action.id, { t: a1, x: tx, y: ty, scale: c.scale, opacity: c.opacity, drawP: 1, ease: action.ease ?? 'smooth' });
      if (action.lines !== false) moves.push({ id: action.id, t0: a0, t1: a1 });
      c.x = tx; c.y = ty;
      break;
    }
    case 'drop': {  // gravity: accelerate straight down to the floor
      const floor = action.to ?? 0.82;
      push(action.id, { t: a0, x: c.x, y: c.y, scale: c.scale, opacity: c.opacity, drawP: 1, ease: 'linear' });
      push(action.id, { t: a1, x: c.x, y: floor, scale: c.scale, opacity: c.opacity, drawP: 1, ease: 'accelerate' });
      moves.push({ id: action.id, t0: a0, t1: a1 });
      c.y = floor;
      break;
    }
    case 'throw': {  // projectile: rise to an apex, then fall under gravity to the target
      const [tx, ty] = action.to;
      const apexY = Math.min(c.y, ty) - (action.height ?? 0.22);
      const tm = a0 + (a1 - a0) * 0.5;
      push(action.id, { t: a0, x: c.x, y: c.y, scale: c.scale, opacity: c.opacity, drawP: 1, ease: 'linear' });
      push(action.id, { t: tm, x: (c.x + tx) / 2, y: apexY, scale: c.scale, opacity: c.opacity, drawP: 1, ease: 'decelerate' });
      push(action.id, { t: a1, x: tx, y: ty, scale: c.scale, opacity: c.opacity, drawP: 1, ease: 'accelerate' });
      moves.push({ id: action.id, t0: a0, t1: a1 });
      c.x = tx; c.y = ty;
      break;
    }
    case 'push': {
      const [dx, dy] = DIR[action.dir] ?? [1, 0];
      const dist = action.distance ?? 0.32;
      const antic = a0 + (a1 - a0) * 0.36;      // force shown, object barely stirs (anticipation)
      forces.push({ id: action.id, t0: a0, t1: antic, dir: action.dir });
      push(action.id, { t: a0, x: c.x, y: c.y, scale: c.scale, opacity: c.opacity, drawP: 1, ease: 'linear' });
      // tiny wind-back against the force, then accelerate away
      push(action.id, { t: antic, x: c.x - dx * 0.012, y: c.y - dy * 0.012, scale: c.scale, opacity: c.opacity, drawP: 1, ease: 'smooth' });
      const nx = c.x + dx * dist, ny = c.y + dy * dist;
      push(action.id, { t: a1, x: nx, y: ny, scale: c.scale, opacity: c.opacity, drawP: 1, ease: 'accelerate' });
      moves.push({ id: action.id, t0: antic, t1: a1 });
      c.x = nx; c.y = ny;
      break;
    }
    case 'scale': {
      const s = action.to;
      push(action.id, { t: a0, x: c.x, y: c.y, scale: c.scale, opacity: c.opacity, drawP: 1, ease: 'linear' });
      push(action.id, { t: a1, x: c.x, y: c.y, scale: s, opacity: c.opacity, drawP: 1, ease: 'bounce' });
      c.scale = s;
      break;
    }
    case 'shake':
    case 'pulse': {
      // a brief keyframe pair; the sampler adds the wobble/pulse from these bounds
      push(action.id, { t: a0, x: c.x, y: c.y, scale: c.scale, opacity: c.opacity, drawP: 1, ease: 'linear' });
      push(action.id, { t: a1, x: c.x, y: c.y, scale: c.scale, opacity: c.opacity, drawP: 1, ease: 'linear' });
      break;
    }
  }
}

export interface Sample { visible: boolean; x: number; y: number; scale: number; opacity: number; drawP: number; }

/** Sample an actor's transform at scene-relative time `t`. */
export function sampleTrack(kfs: Keyframe[], t: number): Sample {
  if (!kfs.length) return { visible: false, x: 0, y: 0, scale: 1, opacity: 1, drawP: 0 };
  if (t < kfs[0].t) return { visible: false, x: kfs[0].x, y: kfs[0].y, scale: kfs[0].scale, opacity: 0, drawP: 0 };
  let a = kfs[0], b = kfs[0];
  for (let i = 1; i < kfs.length; i++) { if (kfs[i].t >= t) { b = kfs[i]; a = kfs[i - 1]; break; } a = b = kfs[i]; }
  if (a === b) return { visible: true, x: a.x, y: a.y, scale: a.scale, opacity: a.opacity, drawP: a.drawP };
  const span = b.t - a.t || 1;
  const p = EASE[b.ease](Math.max(0, Math.min(1, (t - a.t) / span)));
  return {
    visible: true,
    x: a.x + (b.x - a.x) * p,
    y: a.y + (b.y - a.y) * p,
    scale: a.scale + (b.scale - a.scale) * p,
    opacity: a.opacity + (b.opacity - a.opacity) * p,
    drawP: a.drawP + (b.drawP - a.drawP) * p,
  };
}

/** Is this actor mid-slide at time t (for motion lines)? Returns speed dir or null. */
export function activeMove(moves: MotionInterval[], id: string, t: number): boolean {
  return moves.some((m) => m.id === id && t >= m.t0 && t <= m.t1);
}
export function activeForce(forces: ForceCue[], id: string, t: number): ForceCue | null {
  return forces.find((f) => f.id === id && t >= f.t0 && t <= f.t1) ?? null;
}
