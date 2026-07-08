// Virtual camera: a zoom + focus point applied as a canvas transform around the
// scene content (background and captions stay fixed). Deterministic from `time`
// so seeking and export produce identical frames.

import { clamp, lerp } from './utils';

export interface CameraState {
  zoom: number;
  /** Focus point in frame pixels — the point that lands at frame center. */
  fx: number;
  fy: number;
}

/** A thing the camera is drawn toward this frame, with 0..1 strength. */
export interface FocusTarget {
  x: number;
  y: number;
  zoom: number;
  strength: number;
}

/**
 * Fold focus targets over a gently breathing base. Targets are applied in
 * order; the strongest, latest ones win naturally via lerp.
 */
export function cameraAt(
  time: number,
  W: number,
  H: number,
  targets: FocusTarget[],
): CameraState {
  // idle breathing: barely-there drift that keeps long holds alive
  let zoom = 1 + 0.006 * Math.sin(time * 0.32);
  let fx = W / 2 + Math.sin(time * 0.21) * W * 0.003;
  let fy = H / 2 + Math.cos(time * 0.17) * H * 0.003;

  for (const t of targets) {
    const s = clamp(t.strength, 0, 1);
    if (s <= 0) continue;
    zoom = lerp(zoom, t.zoom, s);
    fx = lerp(fx, t.x, s);
    fy = lerp(fy, t.y, s);
  }

  // keep the frame covered: clamp focus so zoom never reveals the void
  const halfW = W / 2 / zoom;
  const halfH = H / 2 / zoom;
  fx = clamp(fx, halfW, W - halfW);
  fy = clamp(fy, halfH, H - halfH);
  return { zoom, fx, fy };
}

export function applyCamera(
  ctx: CanvasRenderingContext2D,
  cam: CameraState,
  W: number,
  H: number,
) {
  ctx.translate(W / 2, H / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.fx, -cam.fy);
}
