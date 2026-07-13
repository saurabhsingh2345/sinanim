// Deterministic diagram auto-layout via dagre. When a diagram's nodes don't
// carry meaningful coordinates (or the scene opts into `layout:'auto'`), we let
// dagre compute a clean layered graph — the LLM no longer has to hand-place x/y.
// dagre.layout() is synchronous and deterministic, so the result is safe to use
// inside the render path; we memoize per scene signature to avoid recomputing
// every frame.

import dagre from '@dagrejs/dagre';
import type { DiagramScene } from '../types';

export interface NodePos {
  /** center position as fractions of width/height (0..1) — matches DiagramNode.x/y */
  x: number;
  y: number;
}

const cache = new Map<string, Map<string, NodePos>>();

function signature(scene: DiagramScene): string {
  return (
    (scene.layout ?? '') +
    '|' +
    scene.nodes.map((n) => n.id + ':' + n.label.length).join(',') +
    '|' +
    scene.edges.map((e) => e.from + '>' + e.to).join(',')
  );
}

/** True when the scene should be auto-laid-out (no useful coordinates given). */
export function wantsAutoLayout(scene: DiagramScene): boolean {
  if (scene.layout === 'auto') return true;
  if (scene.layout === 'manual') return false;
  // degenerate coordinates: all missing, all zero, or all identical → auto
  const xs = scene.nodes.map((n) => (typeof n.x === 'number' ? n.x : NaN));
  const ys = scene.nodes.map((n) => (typeof n.y === 'number' ? n.y : NaN));
  const anyNaN = xs.some(Number.isNaN) || ys.some(Number.isNaN);
  const distinct = new Set(xs.map((x, i) => `${x},${ys[i]}`)).size;
  return anyNaN || distinct <= 1;
}

/**
 * Compute node center positions (as 0..1 fractions) with dagle. `dir` is the
 * rank direction: 'LR' (left→right, good for pipelines) or 'TB' (top→bottom).
 */
export function diagramLayout(scene: DiagramScene, dir: 'LR' | 'TB' = 'LR'): Map<string, NodePos> {
  const key = dir + '|' + signature(scene);
  const hit = cache.get(key);
  if (hit) return hit;

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: dir, nodesep: 55, ranksep: 90, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of scene.nodes) {
    // approximate box size from label length (monospace) — exact px not needed,
    // we only use the relative layout and re-normalize to fractions.
    const w = 60 + n.label.length * 12;
    g.setNode(n.id, { width: w, height: 60 });
  }
  for (const e of scene.edges) {
    if (g.hasNode(e.from) && g.hasNode(e.to)) g.setEdge(e.from, e.to);
  }
  dagre.layout(g);

  // normalize dagre's pixel coords into 0..1 fractions, padded into the safe area
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of g.nodes()) {
    const nd = g.node(id);
    if (!nd) continue;
    minX = Math.min(minX, nd.x); maxX = Math.max(maxX, nd.x);
    minY = Math.min(minY, nd.y); maxY = Math.max(maxY, nd.y);
  }
  const rawSpanX = maxX - minX;
  const rawSpanY = maxY - minY;
  const spanX = Math.max(rawSpanX, 1);
  const spanY = Math.max(rawSpanY, 1);
  // content occupies the central band; leave headroom for the title at the top
  const padX = 0.14, padY0 = 0.3, padY1 = 0.88;
  // when the graph is a single rank (all nodes one row/column), center it
  const singleRow = rawSpanY < 5; // LR pipeline
  const singleCol = rawSpanX < 5; // TB stack
  const out = new Map<string, NodePos>();
  for (const n of scene.nodes) {
    const nd = g.node(n.id);
    if (!nd) { out.set(n.id, { x: 0.5, y: 0.55 }); continue; }
    const fx = singleCol ? 0.5 : padX + ((nd.x - minX) / spanX) * (1 - 2 * padX);
    const fy = singleRow ? 0.55 : padY0 + ((nd.y - minY) / spanY) * (padY1 - padY0);
    out.set(n.id, { x: scene.nodes.length === 1 ? 0.5 : fx, y: fy });
  }
  cache.set(key, out);
  return out;
}
