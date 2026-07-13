// Scene transitions — premium, deterministic *reveal* overlays plus a true
// cross-dissolve path. Every function is a pure function of the reveal progress
// `p ∈ [0,1]` (0 = incoming scene fully covered, 1 = fully revealed), so preview
// and export always agree and any frame is seek-safe.
//
// Two families:
//   1) Overlay reveals (drawReveal) — a themed veil/wipe recedes to uncover the
//      already-drawn incoming scene. Self-contained, cheap, no second render.
//   2) Cross-dissolve (blendPrevFrame) — the caller supplies the outgoing scene's
//      last frame as an image; we blend it over the incoming frame as it fades.
//      This is the "no black flash" film dissolve.

import { clamp } from './utils';
import { easeInOut, easeOutCubic } from './motion';

export interface TransitionColors {
  /** dark veil color, themed (e.g. background) */
  veil: string;
  /** accent for light sweeps / edges */
  accent: string;
}

type Ctx = CanvasRenderingContext2D;

/** Soft-edged linear gradient alpha helper for wipes. */
function softStop(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, cover: number, veil: string) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  const edge = 0.14; // feather width in gradient space
  const c = clamp(cover, 0, 1);
  g.addColorStop(0, veil);
  const a = clamp(c, 0, 1);
  const b = clamp(c + edge, 0, 1);
  if (a > 0) g.addColorStop(a, veil);
  g.addColorStop(b, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  return g;
}

function withAlpha(color: string, a: number): string {
  // color is #rrggbb or rgb(...) — coerce to rgba
  if (color.startsWith('#')) {
    const h = color.slice(1);
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  if (color.startsWith('rgb(')) return color.replace('rgb(', 'rgba(').replace(')', `,${a})`);
  return color;
}

/**
 * Draw a receding reveal overlay. `p` is 0→1 reveal progress; at p=1 nothing is
 * drawn. `dir` selects wipe/bar direction where relevant.
 */
export function drawReveal(
  ctx: Ctx,
  kind: string,
  p: number,
  W: number,
  H: number,
  colors: TransitionColors,
  dir: 'left' | 'right' | 'up' | 'down' = 'left',
) {
  const r = clamp(p, 0, 1);
  if (r >= 1) return;
  const e = easeOutCubic(r);
  const veil = colors.veil || '#08080c';

  ctx.save();
  switch (kind) {
    case 'dissolve':
    case 'fade': {
      // themed veil fading out, with a faint accent light-leak that lifts as it clears
      ctx.fillStyle = withAlpha(veil, (1 - e) * 0.92);
      ctx.fillRect(0, 0, W, H);
      const leak = Math.sin(r * Math.PI) * 0.10;
      if (leak > 0.002) {
        const g = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, W * 0.6);
        g.addColorStop(0, withAlpha(colors.accent, leak));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      break;
    }
    case 'wipe': {
      const cover = 1 - e; // fraction still covered
      let x0 = 0, y0 = 0, x1 = W, y1 = 0;
      if (dir === 'right') { x0 = W; x1 = 0; }
      else if (dir === 'up') { x0 = 0; y0 = H; x1 = 0; y1 = 0; }
      else if (dir === 'down') { x0 = 0; y0 = 0; x1 = 0; y1 = H; }
      ctx.fillStyle = softStop(ctx, x0, y0, x1, y1, cover, withAlpha(veil, 0.95));
      ctx.fillRect(0, 0, W, H);
      // bright leading edge
      const pos = dir === 'up' || dir === 'down' ? H : W;
      const at = (dir === 'right' || dir === 'up') ? pos * cover : pos * (1 - cover);
      ctx.globalAlpha = Math.sin(r * Math.PI) * 0.5;
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      if (dir === 'left' || dir === 'right') { ctx.moveTo(at, 0); ctx.lineTo(at, H); }
      else { ctx.moveTo(0, at); ctx.lineTo(W, at); }
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    }
    case 'iris': {
      // expanding circular hole reveals the scene from the center
      const maxR = Math.hypot(W, H) / 2;
      const rad = e * maxR * 1.02;
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.arc(W / 2, H / 2, rad, 0, Math.PI * 2, true); // counter-clockwise → hole
      ctx.fillStyle = withAlpha(veil, 0.95);
      ctx.fill('evenodd');
      // soft ring on the iris edge
      ctx.globalAlpha = Math.sin(r * Math.PI) * 0.5;
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;
    }
    case 'bars': {
      // horizontal bars slide apart from the center line
      const n = 6;
      const bh = H / n;
      ctx.fillStyle = withAlpha(veil, 0.95);
      for (let i = 0; i < n; i++) {
        const local = clamp((e - (i % 2) * 0.12) / 0.88, 0, 1);
        const w = W * (1 - easeInOut(local));
        const fromRight = i % 2 === 0;
        ctx.fillRect(fromRight ? W - w : 0, i * bh, w, bh + 1);
      }
      break;
    }
    case 'sweep': {
      // a single diagonal light band passes once over a fading veil
      ctx.fillStyle = withAlpha(veil, (1 - e) * 0.9);
      ctx.fillRect(0, 0, W, H);
      const bandX = (r * 1.4 - 0.2) * W;
      const g = ctx.createLinearGradient(bandX - W * 0.18, 0, bandX + W * 0.18, H);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.5, withAlpha(colors.accent, Math.sin(r * Math.PI) * 0.28));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      break;
    }
    default: {
      // 'zoom' and unknowns: gentle themed fade
      ctx.fillStyle = withAlpha(veil, (1 - e) * 0.8);
      ctx.fillRect(0, 0, W, H);
    }
  }
  ctx.restore();
}

/**
 * The world-space entry offset for content that physically slides/pushes in.
 * Returns pixels to translate the incoming world by (recedes to 0 as p→1).
 */
export function slideEntryOffset(
  p: number,
  W: number,
  H: number,
  dir: 'left' | 'right' | 'up' | 'down' = 'left',
): { dx: number; dy: number } {
  const e = easeOutCubic(clamp(p, 0, 1));
  const off = (1 - e);
  switch (dir) {
    case 'right': return { dx: -W * 0.12 * off, dy: 0 };
    case 'up': return { dx: 0, dy: H * 0.12 * off };
    case 'down': return { dx: 0, dy: -H * 0.12 * off };
    default: return { dx: W * 0.12 * off, dy: 0 };
  }
}

/**
 * True cross-dissolve: blend the outgoing scene's captured last frame over the
 * freshly-drawn incoming frame. `img` is anything drawImage accepts (canvas,
 * bitmap). `p` 0→1: outgoing fades from full to gone.
 */
export function blendPrevFrame(
  ctx: Ctx,
  img: CanvasImageSource,
  p: number,
  W: number,
  H: number,
) {
  const e = easeInOut(clamp(p, 0, 1));
  ctx.save();
  ctx.globalAlpha = 1 - e;
  try {
    ctx.drawImage(img, 0, 0, W, H);
  } catch {
    /* image not ready — skip, incoming frame stands alone */
  }
  ctx.restore();
}

/** A default transition per scene type so every cut feels intentional. */
export function defaultTransition(type: string): SceneTransitionKind {
  switch (type) {
    case 'title':
      return 'dissolve';
    case 'chapter':
      return 'sweep';
    case 'quote':
    case 'bigstat':
      return 'dissolve';
    case 'bullets':
    case 'diagram':
      return 'fade';
    case 'quiz':
    case 'challenge':
      return 'iris';
    default:
      return 'fade';
  }
}

export type SceneTransitionKind =
  | 'none' | 'fade' | 'slide' | 'push' | 'zoom'
  | 'dissolve' | 'wipe' | 'iris' | 'bars' | 'sweep';
