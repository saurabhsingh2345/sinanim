// The whiteboard "brain": turn a high-level BLUEPRINT (what the LLM reasons
// about — concepts, how they relate, which layout fits) into a fully placed
// WhiteboardScene (what the renderer draws — icons, labels, edge-to-edge arrows,
// emphasis marks), revealed beat by beat in sync with narration.
//
// The LLM never invents coordinates. It picks a layout intent and lists nodes +
// links; this module does all geometry deterministically, so every board is well
// spaced, every actor gets an icon, and every arrow actually connects two things.
import { WhiteboardScene, BoardElement, BoardStep, BoardStyle, WBActor, WBAction } from '../types';

const W = 1920, H = 1080; // scenes are authored at 1080p; positions are fractions

export type WBLayout = 'flow' | 'compare' | 'cycle' | 'hub' | 'tree' | 'timeline' | 'stack';
export interface WBNode {
  id: string;
  label: string;
  icon: string;                 // concept word — resolved to a real icon at render
  say?: string;                 // the spoken line drawn WITH this node
  emphasis?: 'good' | 'bad' | 'key';
  group?: 'left' | 'right';     // for the compare layout
}
export interface WBLink { from: string; to: string; label?: string; style?: 'arrow' | 'curve'; }
export interface Blueprint {
  title: string;
  layout: WBLayout;
  intro?: string;
  board?: BoardStyle;
  nodes: WBNode[];
  links: WBLink[];
}

interface Placed extends WBNode { x: number; y: number; scale: number; labelX: number; labelY: number; }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const LAYOUTS: WBLayout[] = ['flow', 'compare', 'cycle', 'hub', 'tree', 'timeline', 'stack'];

// ── normalize possibly-messy LLM output into a safe blueprint ─────────────────────
export function normalizeBlueprint(raw: any): Blueprint {
  const layout: WBLayout = LAYOUTS.includes(raw?.layout) ? raw.layout : 'flow';
  const board: BoardStyle = ['white', 'blackboard', 'paper'].includes(raw?.board) ? raw.board : 'white';
  const seen = new Set<string>();
  const nodes: WBNode[] = (Array.isArray(raw?.nodes) ? raw.nodes : [])
    .map((n: any, i: number) => {
      const label = String(n?.label ?? n?.text ?? n?.name ?? '').trim();
      let id = String(n?.id ?? label ?? `n${i}`).trim().toLowerCase().replace(/\s+/g, '-') || `n${i}`;
      while (seen.has(id)) id = `${id}-${i}`;
      seen.add(id);
      const icon = String(n?.icon ?? n?.src ?? label.split(/\s+/)[0] ?? '').trim();
      const em = ['good', 'bad', 'key'].includes(n?.emphasis) ? n.emphasis : undefined;
      const grp = n?.group === 'left' || n?.group === 'right' ? n.group : undefined;
      return { id, label, icon, say: n?.say ? String(n.say) : undefined, emphasis: em, group: grp };
    })
    .filter((n: WBNode) => n.label || n.icon)
    .slice(0, 7);
  const ids = new Set(nodes.map((n) => n.id));
  const links: WBLink[] = (Array.isArray(raw?.links) ? raw.links : [])
    .map((l: any) => ({
      from: String(l?.from ?? '').trim().toLowerCase().replace(/\s+/g, '-'),
      to: String(l?.to ?? '').trim().toLowerCase().replace(/\s+/g, '-'),
      label: l?.label ? String(l.label) : undefined,
      style: l?.style === 'curve' ? 'curve' : 'arrow',
    }))
    .filter((l: WBLink) => ids.has(l.from) && ids.has(l.to) && l.from !== l.to);
  return { title: String(raw?.title ?? '').trim() || 'Explainer', layout, board, intro: raw?.intro ? String(raw.intro) : undefined, nodes, links };
}

// ── layout: assign each node an [x,y] (fraction), a draw scale, and a label spot ──
function place(bp: Blueprint): Placed[] {
  const n = bp.nodes.length;
  const iconHalfF = (scale: number) => 0.12 * scale;            // icon half-height, in H-fractions
  const below = (x: number, y: number, scale: number) => ({ labelX: x, labelY: clamp(y + iconHalfF(scale) + 0.05, 0, 0.95) });
  // label pushed radially outward from a center; kept on-frame, and dropped BELOW
  // the icon (never up into the title) when the outward spot would sit too high.
  const outward = (x: number, y: number, cx: number, cy: number, k: number, scale: number) => {
    const labelX = clamp(cx + (x - cx) * k, 0.07, 0.93);
    const ly = cy + (y - cy) * k;
    return { labelX, labelY: ly < 0.26 ? clamp(y + iconHalfF(scale) + 0.05, 0, 0.95) : clamp(ly, 0.06, 0.96) };
  };

  switch (bp.layout) {
    case 'compare': {
      const left = bp.nodes.filter((nd, i) => (nd.group ? nd.group === 'left' : i < Math.ceil(n / 2)));
      const right = bp.nodes.filter((nd) => !left.includes(nd));
      const scale = clamp(1.0 - 0.05 * Math.max(left.length, right.length), 0.62, 0.9);
      const col = (list: WBNode[], cx: number): Placed[] => {
        const m = list.length || 1;
        return list.map((nd, i) => {
          const y = m === 1 ? 0.52 : 0.36 + (0.72 - 0.36) * (i / (m - 1));
          return { ...nd, x: cx, y, scale, ...below(cx, y, scale) };
        });
      };
      return [...col(left, 0.28), ...col(right, 0.72)];
    }
    case 'cycle': {
      const cx = 0.5, cy = 0.57, rx = 0.28, ry = 0.24;
      const scale = clamp(1.0 - 0.07 * n, 0.58, 0.9);
      return bp.nodes.map((nd, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
        return { ...nd, x, y, scale, ...outward(x, y, cx, cy, 1.3, scale) };
      });
    }
    case 'hub': {
      const cx = 0.5, cy = 0.57;
      const spokes = bp.nodes.slice(1);
      const m = spokes.length || 1;
      const out: Placed[] = [{ ...bp.nodes[0], x: cx, y: cy, scale: 1.02, ...below(cx, cy, 1.02) }];
      spokes.forEach((nd, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / m;
        const x = cx + Math.cos(a) * 0.31, y = cy + Math.sin(a) * 0.27;
        out.push({ ...nd, x, y, scale: 0.76, ...outward(x, y, cx, cy, 1.26, 0.76) });
      });
      return out;
    }
    case 'tree': {
      const root = bp.nodes[0];
      const kids = bp.nodes.slice(1);
      const m = kids.length || 1;
      const out: Placed[] = [{ ...root, x: 0.5, y: 0.34, scale: 0.95, ...below(0.5, 0.34, 0.95) }];
      kids.forEach((nd, i) => {
        const x = m === 1 ? 0.5 : 0.16 + (0.84 - 0.16) * (i / (m - 1));
        const y = 0.68;
        out.push({ ...nd, x, y, scale: clamp(1.0 - 0.06 * m, 0.68, 0.88), ...below(x, y, 0.85) });
      });
      return out;
    }
    case 'timeline': {
      const scale = clamp(0.95 - 0.05 * n, 0.6, 0.82);
      const y = 0.52;
      return bp.nodes.map((nd, i) => {
        const x = n === 1 ? 0.5 : 0.12 + (0.88 - 0.12) * (i / (n - 1));
        const up = i % 2 === 0;
        return { ...nd, x, y, scale, labelX: x, labelY: up ? clamp(y - 0.12 * scale - 0.06, 0.05, 1) : clamp(y + 0.12 * scale + 0.06, 0, 0.95) };
      });
    }
    case 'stack': {
      const scale = clamp(1.0 - 0.06 * n, 0.62, 0.85);
      return bp.nodes.map((nd, i) => {
        const y = n === 1 ? 0.52 : 0.3 + (0.8 - 0.3) * (i / (n - 1));
        return { ...nd, x: 0.42, y, scale, labelX: clamp(0.42 + 0.16 * scale + 0.04, 0, 0.9), labelY: y };
      });
    }
    default: { // flow — left→right, wraps to two rows past 4
      const scale = clamp(1.28 - 0.11 * n, 0.66, 1.12);
      if (n <= 4) {
        const y = 0.46;
        return bp.nodes.map((nd, i) => {
          const x = n === 1 ? 0.5 : 0.15 + (0.85 - 0.15) * (i / (n - 1));
          return { ...nd, x, y, scale, ...below(x, y, scale) };
        });
      }
      const perRow = Math.ceil(n / 2);
      return bp.nodes.map((nd, i) => {
        const row = Math.floor(i / perRow), col = i % perRow;
        const inRow = row === 1 ? n - perRow : perRow;
        const x = inRow === 1 ? 0.5 : 0.15 + (0.85 - 0.15) * (col / (inRow - 1));
        const y = row === 0 ? 0.36 : 0.68;
        return { ...nd, x, y, scale: clamp(scale, 0.66, 0.9), ...below(x, y, scale) };
      });
    }
  }
}

// default connectors when the LLM didn't specify links (so a flow still flows)
function autoLinks(bp: Blueprint): WBLink[] {
  if (bp.links.length) return bp.links;
  const ids = bp.nodes.map((n) => n.id);
  if (bp.layout === 'flow' || bp.layout === 'timeline') return ids.slice(1).map((to, i) => ({ from: ids[i], to, style: 'arrow' as const }));
  if (bp.layout === 'cycle') return ids.map((from, i) => ({ from, to: ids[(i + 1) % ids.length], style: 'curve' as const }));
  if (bp.layout === 'hub' || bp.layout === 'tree') return ids.slice(1).map((to) => ({ from: ids[0], to, style: bp.layout === 'hub' ? 'curve' as const : 'arrow' as const }));
  return [];
}

// arrow endpoints on the icon EDGES (pixel-space geometry so it looks right on a
// non-square frame), returned as fractions for the renderer.
function edge(a: Placed, b: Placed): { from: [number, number]; to: [number, number] } {
  const pdx = (b.x - a.x) * W, pdy = (b.y - a.y) * H;
  const len = Math.hypot(pdx, pdy) || 1;
  const ux = pdx / len, uy = pdy / len;
  const ra = 138 * a.scale, rb = 138 * b.scale;
  return {
    from: [(a.x * W + ux * ra) / W, (a.y * H + uy * ra) / H],
    to: [(b.x * W - ux * rb) / W, (b.y * H - uy * rb) / H],
  };
}

function emphasisEls(nd: Placed): BoardElement[] {
  const half = 0.12 * nd.scale;
  if (nd.emphasis === 'good') return [{ kind: 'check', at: [clamp(nd.x + 0.055, 0, 1), clamp(nd.y - half * 0.6, 0, 1)] }];
  if (nd.emphasis === 'bad') return [{ kind: 'cross', at: [clamp(nd.x + 0.055, 0, 1), clamp(nd.y - half * 0.6, 0, 1)] }];
  if (nd.emphasis === 'key') {
    const rx = 0.075 * nd.scale, ry = 0.14 * nd.scale;
    return [{ kind: 'circle', from: [nd.x - rx, nd.y - ry], to: [nd.x + rx, nd.y + ry], color: '#e08a1e' }];
  }
  return [];
}

// ── compile blueprint → WhiteboardScene (title beat + one beat per node) ──────────
export function compileBlueprint(raw: any): WhiteboardScene {
  const bp = normalizeBlueprint(raw);
  const placed = place(bp);
  const byId = new Map(placed.map((p) => [p.id, p]));
  const links = autoLinks(bp);

  const steps: BoardStep[] = [];
  // beat 0 — write the title while the intro is spoken (no step narration → no double-speak)
  const titleEls: BoardElement[] = [
    { kind: 'text', text: bp.title, at: [0.5, 0.1], size: 66 },
    { kind: 'underline', from: [clamp(0.5 - bp.title.length * 0.0105, 0.16, 0.42), 0.155], to: [clamp(0.5 + bp.title.length * 0.0105, 0.58, 0.84), 0.155] },
  ];
  if (bp.layout === 'compare') titleEls.push({ kind: 'underline', from: [0.5, 0.3], to: [0.5, 0.82] });
  steps.push({ add: titleEls });

  // one beat per node, in teaching order; its incoming links draw with it so the
  // arrow connects from an already-drawn source to the node just appearing.
  for (const nd of placed) {
    const add: BoardElement[] = [
      { kind: 'object', src: nd.icon || nd.label, at: [nd.x, nd.y], scale: nd.scale },
      { kind: 'text', text: nd.label, at: [nd.labelX, nd.labelY], size: Math.round(40 * clamp(nd.scale, 0.7, 1.1)) },
    ];
    for (const l of links.filter((x) => x.to === nd.id && byId.has(x.from))) {
      const a = byId.get(l.from)!, e = edge(a, nd);
      add.push({ kind: l.style === 'curve' ? 'curve' : 'arrow', from: e.from, to: e.to });
      if (l.label) add.push({ kind: 'text', text: l.label, at: [(e.from[0] + e.to[0]) / 2, (e.from[1] + e.to[1]) / 2 - 0.04], size: 28 });
    }
    add.push(...emphasisEls(nd));
    steps.push({ narration: nd.say, add });
  }

  return {
    type: 'whiteboard',
    board: bp.board,
    pen: true,
    steps,
    startTime: 0,
    duration: Math.max(8, 3 + placed.length * 3.2),
    narration: bp.intro || `Let's break down ${bp.title}.`,
  } as WhiteboardScene;
}

// ── story mode: persistent actors + a beat timeline of ACTIONS (motion) ───────────
const nid = (v: any) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, '-');

export function compileStory(raw: any): WhiteboardScene {
  const title = String(raw?.title ?? '').trim() || 'Explainer';
  const board: BoardStyle = ['white', 'blackboard', 'paper'].includes(raw?.board) ? raw.board : 'white';
  const rawActors: any[] = Array.isArray(raw?.actors) ? raw.actors : [];
  const actors: WBActor[] = rawActors.map((a: any, i: number) => {
    const label = a?.label ? String(a.label) : undefined;
    const icon = String(a?.icon ?? a?.src ?? label ?? '').trim();
    const at: [number, number] = Array.isArray(a?.at)
      ? [clamp(Number(a.at[0]) || 0.5, 0, 1), clamp(Number(a.at[1]) || 0.5, 0, 1)]
      : [rawActors.length > 1 ? 0.2 + 0.6 * (i / (rawActors.length - 1)) : 0.5, 0.52];
    return { id: nid(a?.id ?? label ?? `a${i}`) || `a${i}`, icon, label, at, scale: a?.scale ? clamp(Number(a.scale) || 1, 0.1, 4) : undefined };
  }).filter((a) => a.id).slice(0, 10);
  const ids = new Set(actors.map((a) => a.id));

  const rawBeats: any[] = Array.isArray(raw?.beats) ? raw.beats : [];
  const beats = rawBeats.map((bt: any) => {
    const src = Array.isArray(bt?.do) ? bt.do : Array.isArray(bt?.actions) ? bt.actions : [];
    const acts: WBAction[] = src.map((a: any) => {
      if (a?.act === 'note' || a?.act === 'mark') return a as WBAction;
      if (a?.act === 'clear') return (Array.isArray(a.ids) ? { act: 'clear', ids: a.ids.map(nid) } : { act: 'clear' }) as WBAction;
      return { ...a, id: nid(a?.id) } as WBAction;
    }).filter((a: any) => a.act === 'note' || a.act === 'mark' || a.act === 'clear' || ids.has(a.id));
    return { say: bt?.say ?? bt?.narration, acts };
  });

  // safety net: an actor never introduced with draw/appear before its first use
  // would be invisible when moved — inject a draw so nothing is missing.
  for (const actor of actors) {
    let firstBeat = -1, firstIsIntro = false;
    for (let i = 0; i < beats.length; i++) {
      const ref = beats[i].acts.find((a: any) => a.id === actor.id);
      if (ref) { firstBeat = i; firstIsIntro = ref.act === 'draw' || ref.act === 'appear'; break; }
    }
    if (firstBeat === -1) { if (beats.length) beats[0].acts.unshift({ act: 'draw', id: actor.id }); }
    else if (!firstIsIntro) beats[firstBeat].acts.unshift({ act: 'draw', id: actor.id });
  }

  const steps: BoardStep[] = [];
  steps.push({ add: [], do: [
    { act: 'note', text: title, at: [0.5, 0.1], size: 64 },
    { act: 'mark', kind: 'underline', from: [clamp(0.5 - title.length * 0.0105, 0.16, 0.42), 0.155], to: [clamp(0.5 + title.length * 0.0105, 0.58, 0.84), 0.155] },
  ] });
  for (const bt of beats) steps.push({ narration: bt.say ? String(bt.say) : undefined, add: [], do: bt.acts });

  return {
    type: 'whiteboard', board, pen: true, actors, steps,
    startTime: 0,
    duration: Math.max(9, 3 + beats.length * 3.6),
    narration: raw?.intro ? String(raw.intro) : `Let's see how ${title} works.`,
  } as WhiteboardScene;
}

/** Top-level: pick story vs diagram from the blueprint's mode. */
export function compileWhiteboard(raw: any): WhiteboardScene {
  const story = raw?.mode === 'story' || Array.isArray(raw?.actors) || Array.isArray(raw?.beats);
  return story ? compileStory(raw) : compileBlueprint(raw);
}
