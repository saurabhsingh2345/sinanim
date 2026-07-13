// Virtual camera: a zoom + focus point applied as a canvas transform around the
// scene content (background and captions stay fixed). Deterministic from `time`
// so seeking and export produce identical frames.

import { clamp, lerp } from './utils';

export interface CameraState {
  zoom: number;
  /** Focus point in frame pixels — the point that lands at frame center. */
  fx: number;
  fy: number;
  /** Additional physical jolt applied on top of the transform (px + radians). */
  shakeX: number;
  shakeY: number;
  shakeRot: number;
}

/** A thing the camera is drawn toward this frame, with 0..1 strength. */
export interface FocusTarget {
  x: number;
  y: number;
  zoom: number;
  strength: number;
}

export interface CameraOpts {
  /**
   * Idle "breathing" amplitude (0 = perfectly still, pixel-perfect for code;
   * ~0.008–0.014 = a barely-perceptible cinematic drift for card scenes). This
   * is what keeps title/chapter/quote frames from feeling dead-static.
   */
  breath?: number;
  /** Per-frame screen-shake offset (from seedrng.shakeAt) for error jolts. */
  shakeX?: number;
  shakeY?: number;
  shakeRot?: number;
}

/**
 * Fold focus targets over the base. When `breath` is 0 the base is a perfectly
 * centered identity (resting text lands on the pixel grid, no shimmer). When
 * `breath` > 0 the base slowly drifts + zooms like a locked-off cinema camera on
 * a slider — motion that reads as "alive" without pulling focus. Real targets
 * (card push-ins, highlight dives) fold on top; the strongest, latest ones win.
 */
export function cameraAt(
  time: number,
  W: number,
  H: number,
  targets: FocusTarget[],
  opts: CameraOpts = {},
): CameraState {
  const breath = Math.max(0, opts.breath ?? 0);
  const shakeX = opts.shakeX ?? 0;
  const shakeY = opts.shakeY ?? 0;
  const shakeRot = opts.shakeRot ?? 0;

  let zoom = 1;
  let fx = W / 2;
  let fy = H / 2;

  if (breath > 0) {
    // slow, incommensurate sinusoids so the loop never obviously repeats
    zoom = 1 + breath * (0.55 + 0.45 * Math.sin(time * 0.47 + 0.6));
    fx = W / 2 + Math.sin(time * 0.31) * W * breath * 1.6;
    fy = H / 2 + Math.cos(time * 0.233 + 1.1) * H * breath * 1.3;
  }

  for (const t of targets) {
    const s = clamp(t.strength, 0, 1);
    if (s <= 0) continue;
    zoom = lerp(zoom, t.zoom, s);
    fx = lerp(fx, t.x, s);
    fy = lerp(fy, t.y, s);
  }

  // when essentially at rest AND not breathing, snap to identity for crisp glyphs
  if (
    breath === 0 &&
    Math.abs(zoom - 1) < 0.004 &&
    Math.abs(fx - W / 2) < 1 &&
    Math.abs(fy - H / 2) < 1
  ) {
    return { zoom: 1, fx: W / 2, fy: H / 2, shakeX, shakeY, shakeRot };
  }

  // keep the frame covered: clamp focus so zoom never reveals the void
  const halfW = W / 2 / zoom;
  const halfH = H / 2 / zoom;
  fx = clamp(fx, halfW, W - halfW);
  fy = clamp(fy, halfH, H - halfH);
  return { zoom, fx, fy, shakeX, shakeY, shakeRot };
}

export function applyCamera(
  ctx: CanvasRenderingContext2D,
  cam: CameraState,
  W: number,
  H: number,
) {
  // shake is a physical jolt of the whole frame — applied outside the zoom so it
  // reads as camera bump, not content scaling.
  if (cam.shakeX || cam.shakeY || cam.shakeRot) {
    ctx.translate(W / 2 + cam.shakeX, H / 2 + cam.shakeY);
    ctx.rotate(cam.shakeRot);
    ctx.translate(-W / 2, -H / 2);
  }
  ctx.translate(W / 2, H / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.fx, -cam.fy);
}
