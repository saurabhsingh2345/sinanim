// IDE template: the flagship full-frame VS Code replica (activity bar, file
// tree, tabs, typed code with IntelliSense/minimap/git-gutter, integrated
// terminal, auto camera). ideTypedCount/ideTypedCharAt feed the Conductor's
// keystroke SFX; ideFocus feeds the shared camera.
import { IdeScene } from '../types';
import { Tok } from '../highlight';
import { inferLang } from '../dsl';
import { clamp, easeInOut, easeOutCubic, lerp } from '../utils';
import { typedReveal } from '../timing';
import { FocusTarget } from '../camera';
import { envelope } from '../motion';
import { ansiToLines, hasAnsi } from '../ansi';
import type { Prepared } from '../renderer';
import {
  C, IDE, ACTIVE_PACK, MONO, SANS, Rect,
  roundRect, withAlpha, cardAlpha, fileColor, plainTokens, revealTokenLinesByLine,
  drawMouseCursor, termLineColor, drawTemplateCaption,
} from './shared';

/** Scroll offset (lines) that keeps `caretLine` comfortably in view. */
function codeScroll(total: number, caretLine: number, maxRows: number): number {
  if (total <= maxRows) return 0;
  return clamp(caretLine - maxRows + 3, 0, total - maxRows);
}

/** Clamp a highlight/explain line range to the file's real lines so the glow
 *  never lands on empty rows past end-of-file. */
function clampHi(code: string, file: string, start?: number, end?: number): { file: string; start: number; end: number } {
  const n = Math.max(1, (code || '').split('\n').length);
  const s = Math.max(1, Math.min(Math.round(start ?? 1), n));
  const e = Math.max(s, Math.min(Math.round(end ?? s), n));
  return { file, start: s, end: e };
}

// ── IDE card: a full VS Code–style workspace that types + runs ─────────────────
// One full-frame scene that plays its `steps` across the (narration-stretched)
// duration: file tree + editor tabs + code + integrated terminal, all evolving.

interface TNode { name: string; path: string; isFile: boolean; depth: number; children: Map<string, TNode>; }

function buildFileTree(paths: string[]): TNode {
  const root: TNode = { name: '', path: '', isFile: false, depth: -1, children: new Map() };
  for (const p of paths) {
    const parts = p.split('/').filter(Boolean);
    let cur = root, acc = '';
    parts.forEach((part, i) => {
      acc = acc ? `${acc}/${part}` : part;
      if (!cur.children.has(part))
        cur.children.set(part, { name: part, path: acc, isFile: i === parts.length - 1, depth: cur.depth + 1, children: new Map() });
      cur = cur.children.get(part)!;
    });
  }
  return root;
}

function flattenFileTree(root: TNode): TNode[] {
  const out: TNode[] = [];
  const walk = (n: TNode) => {
    const kids = Array.from(n.children.values()).sort((a, b) =>
      a.isFile === b.isFile ? a.name.localeCompare(b.name) : a.isFile ? 1 : -1,
    );
    for (const c of kids) { out.push(c); if (!c.isFile) walk(c); }
  };
  walk(root);
  return out;
}


// IntelliSense: a small curated pool per language so the autocomplete popup
// suggests believable completions for whatever identifier is being typed.
const KW_JS = ['function', 'const', 'let', 'return', 'import', 'export', 'default', 'async', 'await', 'class', 'extends', 'console', 'document', 'window', 'addEventListener', 'querySelector', 'getElementById', 'map', 'filter', 'reduce', 'forEach', 'length', 'push', 'includes', 'useState', 'useEffect', 'useMemo', 'useRef', 'fetch', 'JSON', 'Promise', 'Array', 'Object'];
const KW: Record<string, string[]> = {
  python: ['def', 'class', 'return', 'import', 'from', 'self', 'print', 'range', 'len', 'str', 'int', 'float', 'list', 'dict', 'tuple', 'append', 'lambda', 'yield', 'async', 'await', 'True', 'False', 'None', 'jsonify', 'Flask', 'route', 'request', 'enumerate', 'sorted', 'filter'],
  javascript: KW_JS,
  jsx: KW_JS,
  typescript: [...KW_JS, 'interface', 'type', 'enum', 'implements', 'readonly', 'string', 'number', 'boolean', 'unknown', 'Record', 'Partial'],
  tsx: [...KW_JS, 'interface', 'type', 'enum', 'string', 'number', 'boolean'],
  html: ['div', 'span', 'button', 'input', 'section', 'header', 'footer', 'nav', 'article', 'class', 'href', 'onClick', 'placeholder', 'value', 'style', 'script', 'label'],
  css: ['display', 'flex', 'grid', 'margin', 'padding', 'color', 'background', 'border', 'border-radius', 'justify-content', 'align-items', 'position', 'absolute', 'relative', 'transform', 'transition'],
};

function autocompleteSuggestions(lang: string, frag: string): string[] {
  const pool = KW[lang] || KW_JS;
  const lf = frag.toLowerCase();
  return pool.filter((k) => k.toLowerCase().startsWith(lf) && k.toLowerCase() !== lf).slice(0, 4);
}

// Default typing pace (chars/sec) when a step doesn't specify one. Deliberately
// slow — a human teacher types thoughtfully, not at machine speed — so the
// learner can read each line as it lands. The reveal still compresses to fit a
// short narration span, so this is the SLOWEST it types, not the fastest.
const IDE_CPS = 13;

/** Scene-relative start time of each IDE step (weighted across the voiced window). */
export function ideStepTimes(scene: IdeScene): number[] {
  const window = Math.min(scene.narrationDuration ?? scene.duration, scene.duration);
  // Narration-synced: each step starts the moment its first sentence is spoken
  // (computed by the narration pipeline). The weights model is the fallback.
  if (scene.stepNarrationTimes && scene.stepNarrationTimes.length === scene.steps.length) {
    const cap = Math.max(window - 0.2, 0.2);
    const times = scene.stepNarrationTimes.slice();
    // If the tail runs past the window, fan the late steps out just under the cap
    // instead of stacking every one of them on the exact same final frame.
    for (let i = times.length - 1; i >= 0; i--) {
      const ceil = cap - (times.length - 1 - i) * 0.12;
      if (times[i] > ceil) times[i] = Math.max(0, ceil);
    }
    for (let i = 1; i < times.length; i++) if (times[i] < times[i - 1] + 0.05) times[i] = times[i - 1] + 0.05;
    return times;
  }
  const usable = Math.max(window - 0.5, 0.6);
  // Fallback (no measured narration times): weight each step by how much it SAYS
  // (≈ speech time) so a talky step holds longer, plus a floor per action kind —
  // this keeps even the estimate roughly voice-aligned instead of uniform.
  const weight = (st: IdeScene['steps'][number]) => {
    if (st.weight) return st.weight;
    const spoken = st.narration ? st.narration.trim().length / 42 : 0;
    const base = st.action.kind === 'type' ? 1.7 : st.action.kind === 'run' ? 1.5 : 0.8;
    return Math.max(base, spoken);
  };
  const sum = scene.steps.reduce((a, s) => a + weight(s), 0) || 1;
  let t = 0.25;
  return scene.steps.map((s) => { const at = t; t += (weight(s) / sum) * usable; return at; });
}

// ── Typed-character counters (drive keystroke SFX from the Conductor) ────────────
// Each returns a monotonic count that rises as the template types; the Conductor
// fires one keystroke per increment. Divided down so it clatters like real typing,
// not a machine gun.
export function ideTypedCount(scene: IdeScene, time: number): number {
  const local = time - scene.startTime;
  const times = ideStepTimes(scene);
  let k = -1; for (let i = 0; i < times.length; i++) if (local >= times[i] - 1e-6) k = i;
  const endK = k + 1 < times.length ? times[k + 1] : Math.min(scene.narrationDuration ?? scene.duration, scene.duration);
  const stepDur = Math.max(endK - (times[k] ?? 0), 0.001);
  const stepLocal = k >= 0 ? local - times[k] : 0;
  const buffers = new Map<string, string>(scene.files.map((f) => [f.path, f.code || ''] as const));
  let count = 0;
  for (let j = 0; j <= k; j++) {
    const st = scene.steps[j]; if (!st) break;
    const act = st.action;
    if (act.kind === 'type') {
      const prev = buffers.get(act.file) || '';
      const full = act.code;
      const speed = act.typingSpeed ?? IDE_CPS;
      const rv = j < k
        ? typedReveal(prev, full, 1e9, 0.001, speed)
        : typedReveal(prev, full, stepLocal, stepDur, speed);
      count += j < k ? rv.totalNew : rv.typedNew;
      buffers.set(act.file, full);
    } else if (act.kind === 'create') {
      const nm = (act.file.split('/').pop() || '').length;
      const cr = j < k ? nm : Math.round(nm * clamp(stepLocal / Math.max(stepDur * 0.55, 0.2), 0, 1));
      count += cr;
    }
  }
  return count;
}

/** Character just typed at `time` (for keystroke SFX). */
export function ideTypedCharAt(scene: IdeScene, time: number): string {
  const local = time - scene.startTime;
  const times = ideStepTimes(scene);
  let k = -1; for (let i = 0; i < times.length; i++) if (local >= times[i] - 1e-6) k = i;
  if (k < 0) return '';
  const st = scene.steps[k];
  if (!st) return '';
  const endK = k + 1 < times.length ? times[k + 1] : Math.min(scene.narrationDuration ?? scene.duration, scene.duration);
  const stepDur = Math.max(endK - times[k], 0.001);
  const stepLocal = local - times[k];
  if (st.action.kind === 'type') {
    const buffers = new Map<string, string>(scene.files.map((f) => [f.path, f.code || ''] as const));
    for (let j = 0; j < k; j++) {
      const a = scene.steps[j]?.action;
      if (a?.kind === 'type') buffers.set(a.file, a.code);
      else if (a?.kind === 'create' && !buffers.has(a.file)) buffers.set(a.file, '');
    }
    const prev = buffers.get(st.action.file) || '';
    const full = st.action.code;
    const rv = typedReveal(prev, full, stepLocal, stepDur, st.action.typingSpeed ?? IDE_CPS);
    if (rv.typedNew <= 0) return '';
    const line = full.split('\n')[rv.caretLine] || '';
    return line[rv.caretCol - 1] || line[line.length - 1] || '';
  }
  if (st.action.kind === 'create') {
    const name = st.action.file.split('/').pop() || '';
    const cr = Math.round(name.length * clamp(stepLocal / Math.max(stepDur * 0.55, 0.2), 0, 1));
    if (cr <= 0) return '';
    return name[cr - 1] || '';
  }
  return '';
}



function drawActivityIcon(ctx: CanvasRenderingContext2D, kind: string, cx: number, cy: number, on: boolean) {
  ctx.save();
  ctx.strokeStyle = on ? IDE.active : IDE.dim;
  ctx.fillStyle = on ? IDE.active : IDE.dim;
  ctx.lineWidth = 2;
  const s = 11;
  if (kind === 'files') {
    roundRect(ctx, cx - s + 3, cy - s, s * 1.4, s * 2, 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 3, cy - s); ctx.lineTo(cx + 3, cy - s + 5); ctx.lineTo(cx + 8, cy - s + 5); ctx.stroke();
  } else if (kind === 'search') {
    ctx.beginPath(); ctx.arc(cx - 2, cy - 2, s * 0.7, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 3, cy + 3); ctx.lineTo(cx + s, cy + s); ctx.stroke();
  } else if (kind === 'git') {
    ctx.beginPath(); ctx.arc(cx - s + 3, cy - s + 4, 3, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx - s + 3, cy + s - 4, 3, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx + s - 4, cy - s + 4, 3, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - s + 3, cy - s + 7); ctx.lineTo(cx - s + 3, cy + s - 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - s + 3, cy); ctx.lineTo(cx + s - 6, cy - s + 6); ctx.stroke();
  } else if (kind === 'run') {
    ctx.beginPath(); ctx.moveTo(cx - s * 0.6, cy - s); ctx.lineTo(cx + s * 0.8, cy); ctx.lineTo(cx - s * 0.6, cy + s); ctx.closePath(); ctx.stroke();
  } else {
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([dx, dy]) => { roundRect(ctx, cx + dx * 3 - 4, cy + dy * 3 - 4, 6, 6, 1.5); ctx.stroke(); });
  }
  ctx.restore();
}

// ── IDE layout (pure — shared by the renderer and the camera) ──────────────────
interface IdeLayout {
  win: Rect; TH: number; SB: number; AB: number; EXw: number;
  cy: number; ch: number; exX: number; edX: number; edW: number;
  TB: number; edBodyY: number; edBodyH: number;
  fs: number; lh: number; charW: number; gutterW: number; codeX: number; codeTop: number;
  rowH: number; treeTop: number;
}
function ideLayout(_scene: IdeScene, W: number, H: number): IdeLayout {
  const M = Math.round(W * 0.032);
  const win: Rect = { x: M, y: Math.round(H * 0.05), w: W - 2 * M, h: H - Math.round(H * 0.11) };
  const TH = 46, SB = 28, AB = 56, TB = 42;
  const cy = win.y + TH;
  const ch = win.h - TH - SB;
  const EXw = Math.round(Math.min(Math.max(win.w * 0.19, 220), 320));
  const exX = win.x + AB;
  const edX = win.x + AB + EXw;
  const edW = win.x + win.w - edX;
  const edBodyY = cy + TB;
  const edBodyH = ch - TB;
  const fs = Math.round(H / 40);
  const lh = Math.round(fs * 1.55);
  const charW = fs * 0.6; // ≈ mono advance; drawing re-measures 'M' for exactness
  const gutterW = Math.round(charW * 4.2);
  const codeX = edX + gutterW + 14;
  return { win, TH, SB, AB, EXw, cy, ch, exX, edX, edW, TB, edBodyY, edBodyH, fs, lh, charW, gutterW, codeX, codeTop: edBodyY, rowH: Math.round(H / 34), treeTop: cy + 76 };
}

interface IdeState {
  k: number; rawP: number; p: number;
  opened: string[]; active: string | null;
  buffers: Map<string, string>;
  typing: { file: string; perLine: number[]; caretLine: number; caretCol: number; typedNew: number } | null;
  creating: { file: string; reveal: number } | null;
  term: { command: string; output: string; cmdP: number; outP: number }[];
  hi: { file: string; start: number; end: number } | null;
  caption: string | null;
  visible: string[];
  firstSeen: Map<string, number>;
  actionKind: string | null;
  overlay: string | null;
  clickTarget: string | null;
}

function ideStateAt(scene: IdeScene, time: number): IdeState {
  const local = time - scene.startTime;
  const times = ideStepTimes(scene);
  let k = -1;
  for (let i = 0; i < times.length; i++) if (local >= times[i] - 1e-6) k = i;
  const endK = k + 1 < times.length ? times[k + 1] : Math.min(scene.narrationDuration ?? scene.duration, scene.duration);
  const stepDur = Math.max(endK - (times[k] ?? 0), 0.001);
  const stepLocal = k >= 0 ? local - times[k] : 0;
  const rawP = k >= 0 ? clamp(stepLocal / stepDur, 0, 1) : 0;
  const pE = easeInOut(rawP);

  const buffers = new Map<string, string>(scene.files.map((f) => [f.path, f.code || ''] as const));
  const visibleSet = new Set<string>(scene.files.map((f) => f.path));
  const firstSeen = new Map<string, number>();
  scene.files.forEach((f) => firstSeen.set(f.path, -1));
  const opened: string[] = [];
  let active: string | null = null;
  let typing: IdeState['typing'] = null;
  let creating: IdeState['creating'] = null;
  const term: IdeState['term'] = [];
  let hi: IdeState['hi'] = null;
  let caption: string | null = null;
  let actionKind: string | null = null;
  let overlay: string | null = null;
  let clickTarget: string | null = null;

  const see = (f: string, j: number) => { if (!firstSeen.has(f)) firstSeen.set(f, j); visibleSet.add(f); };
  const openTab = (f: string) => { if (f) { if (!opened.includes(f)) opened.push(f); active = f; } };

  for (let j = 0; j <= k; j++) {
    const st = scene.steps[j]; if (!st) break;
    const done = j < k;
    if (!done) { caption = st.caption || null; actionKind = st.action.kind; overlay = st.key || null; }
    const act = st.action;
    if (act.kind === 'open') { see(act.file, j); openTab(act.file); if (!done) clickTarget = act.file; }
    else if (act.kind === 'create') {
      see(act.file, j); if (!buffers.has(act.file)) buffers.set(act.file, '');
      openTab(act.file);
      if (!done) {
        const name = act.file.split('/').pop() || '';
        creating = { file: act.file, reveal: Math.round(name.length * clamp(stepLocal / Math.max(stepDur * 0.55, 0.2), 0, 1)) };
        clickTarget = act.file;
      }
    } else if (act.kind === 'type') {
      see(act.file, j); openTab(act.file);
      const prev = buffers.get(act.file) || ''; const full = act.code;
      if (!done) {
        const rv = typedReveal(prev, full, stepLocal, stepDur, act.typingSpeed ?? IDE_CPS);
        typing = { file: act.file, perLine: rv.perLine, caretLine: rv.caretLine, caretCol: rv.caretCol, typedNew: rv.typedNew };
        hi = null;
      }
      buffers.set(act.file, full);
    } else if (act.kind === 'run') {
      const p = done ? 1 : pE;
      term.push({ command: act.command, output: act.output || '', cmdP: done ? 1 : clamp(p / 0.3, 0, 1), outP: done ? 1 : clamp((p - 0.35) / 0.6, 0, 1) });
      // files scaffolded by the command pop into the explorer as it runs
      if (act.creates && (done || pE > 0.25)) {
        for (const f of act.creates) { see(f, j); if (!buffers.has(f)) buffers.set(f, ''); }
      }
    } else if (act.kind === 'explain') {
      // teach in place: nothing in the workspace changes; glow lines when given
      if (!done && act.startLine != null) {
        const f = act.file || active;
        if (f) { see(f, j); openTab(f); hi = clampHi(buffers.get(f) || '', f, act.startLine, act.endLine ?? act.startLine); }
      }
    } else {
      const f = act.file || active; if (f) { see(f, j); openTab(f); hi = clampHi(buffers.get(f) || '', f, act.startLine, act.endLine); }
    }
  }
  return { k, rawP, p: pE, opened, active, buffers, typing, creating, term, hi, caption, visible: Array.from(visibleSet), firstSeen, actionKind, overlay, clickTarget };
}

/** Split the editor into code (top) + terminal (bottom) given whether a terminal is up. */
function ideEditorSplit(L: IdeLayout, hasTerm: boolean) {
  const termH = hasTerm ? Math.round(clamp(L.edBodyH * 0.34, 150, L.edBodyH * 0.5)) : 0;
  return { termH, codeH: L.edBodyH - termH };
}

/** Where the camera should look this frame — glides between steps (Screen-Studio style). */
function ideFocusRaw(scene: IdeScene, time: number, W: number, H: number): { x: number; y: number; zoom: number } {
  const L = ideLayout(scene, W, H);
  const S = ideStateAt(scene, time);
  const { codeH, termH } = ideEditorSplit(L, S.term.length > 0);
  const editorMidX = L.edX + L.edW / 2;
  let x = W / 2, y = H / 2, zoom = 1.05;
  const maxRows = Math.max(1, Math.floor((codeH - 12) / L.lh));
  if (S.actionKind === 'type' && S.typing) {
    const total = (S.buffers.get(S.typing.file) || '').split('\n').length;
    const scroll = codeScroll(total, S.typing.caretLine, maxRows);
    const row = clamp(S.typing.caretLine - scroll, 0, maxRows - 1);
    // Follow the caret ROW (slow, one line at a time), but anchor X on the code
    // column — never chase the caret column, or the frame jitters left/right on
    // every keystroke and snaps back on each newline. Keep the zoom gentle so a
    // one-line vertical step barely moves the frame.
    y = L.codeTop + 8 + row * L.lh + L.lh / 2;
    x = editorMidX * 0.9;
    zoom = 1.2; // push in on the line being written so each keystroke reads
  } else if (S.actionKind === 'run') {
    y = L.codeTop + codeH + termH / 2; x = editorMidX; zoom = 1.16;
  } else if ((S.actionKind === 'highlight' || S.actionKind === 'explain') && S.hi) {
    const total = (S.buffers.get(S.hi.file) || '').split('\n').length;
    const mid = Math.round((S.hi.start + S.hi.end) / 2) - 1;
    const scroll = codeScroll(total, mid, maxRows);
    const row = clamp(mid - scroll, 0, maxRows - 1);
    // dive into the lines being taught — the strongest zoom of the scene
    const span = Math.max(1, S.hi.end - S.hi.start + 1);
    y = L.codeTop + 8 + row * L.lh + L.lh / 2; x = editorMidX * 0.92;
    zoom = span <= 2 ? 1.32 : span <= 4 ? 1.24 : 1.16;
  } else if (S.actionKind === 'explain' && S.term.length > 0) {
    // explaining the run's output: settle on the terminal while the voice talks
    y = L.codeTop + codeH + termH / 2; x = editorMidX; zoom = 1.2;
  } else if (S.actionKind === 'explain') {
    x = editorMidX; y = L.codeTop + codeH * 0.45; zoom = 1.1;
  } else if (S.actionKind === 'open' || S.actionKind === 'create') {
    x = L.exX + L.EXw / 2; y = L.cy + codeH / 2; zoom = 1.07;
  }
  return { x, y, zoom };
}

export function ideFocus(scene: IdeScene, time: number, W: number, H: number): FocusTarget | null {
  const times = ideStepTimes(scene);
  const local = time - scene.startTime;
  let k = -1; for (let i = 0; i < times.length; i++) if (local >= times[i] - 1e-6) k = i;
  const cur = ideFocusRaw(scene, time, W, H);
  let { x, y, zoom } = cur;
  if (k > 0) {
    const tIn = local - times[k];
    const TRANS = 0.9; // slow, deliberate glide between steps (was 0.55, felt snappy)
    if (tIn < TRANS) {
      const prev = ideFocusRaw(scene, scene.startTime + times[k] - 0.001, W, H);
      const b = easeInOut(clamp(tIn / TRANS, 0, 1));
      x = lerp(prev.x, cur.x, b); y = lerp(prev.y, cur.y, b); zoom = lerp(prev.zoom, cur.zoom, b);
    }
  }
  const strength = envelope(time, scene.startTime, scene.startTime + scene.duration, 0.85, 0.75) * 0.9;
  if (strength <= 0.01) return null;
  return { x, y, zoom, strength };
}

/** A macOS-style arrow cursor. */
export function drawIdeCard(ctx: CanvasRenderingContext2D, prep: Prepared, scene: IdeScene, time: number, W: number, H: number) {
  const a = cardAlpha(scene, time);
  if (a <= 0) return;
  const idx = prep.dsl.scenes.indexOf(scene);
  const L = ideLayout(scene, W, H);
  const S = ideStateAt(scene, time);
  const { win, TH, SB, AB, EXw, cy, ch, exX, edX, edW, TB } = L;
  const langOf = (p: string) => scene.files.find((f) => f.path === p)?.language || inferLang(p);

  ctx.save();
  ctx.globalAlpha = a;

  // window frame + shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 26;
  ctx.fillStyle = IDE.bg;
  roundRect(ctx, win.x, win.y, win.w, win.h, 16); ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, win.x, win.y, win.w, win.h, 16); ctx.clip();

  // title bar + optional menu
  const showMenu = scene.showMenu !== false;
  const menuH = showMenu ? 26 : 0;
  ctx.fillStyle = IDE.title; ctx.fillRect(win.x, win.y, win.w, TH);
  [C.trafficRed, C.trafficYellow, C.trafficGreen].forEach((c, i) => {
    ctx.beginPath(); ctx.fillStyle = c; ctx.arc(win.x + 26 + i * 22, win.y + TH / 2, 6, 0, Math.PI * 2); ctx.fill();
  });
  // command-center search pill
  const pillW = Math.min(360, win.w * 0.28);
  const pillX = win.x + win.w / 2 - pillW / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; roundRect(ctx, pillX, win.y + 10, pillW, TH - 20, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1; roundRect(ctx, pillX, win.y + 10, pillW, TH - 20, 8); ctx.stroke();
  ctx.font = `400 ${Math.round(TH * 0.28)}px ${SANS}`;
  ctx.fillStyle = IDE.dim; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(`${scene.project || 'workspace'} — Visual Studio Code`, win.x + win.w / 2, win.y + TH / 2 + 1);
  ctx.textAlign = 'left';
  if (showMenu) {
    ctx.fillStyle = IDE.title; ctx.fillRect(win.x, win.y + TH, win.w, menuH);
    ctx.font = `400 ${Math.round(menuH * 0.55)}px ${SANS}`; ctx.fillStyle = IDE.dim; ctx.textBaseline = 'middle';
    let mx = win.x + AB + 12;
    for (const m of ['File', 'Edit', 'Selection', 'View', 'Go', 'Run', 'Terminal', 'Help']) {
      ctx.fillText(m, mx, win.y + TH + menuH / 2 + 1);
      mx += ctx.measureText(m).width + 18;
    }
  }
  // shift content below menu: activity/explorer use cy which is win.y+TH — for menu we draw over explorer top
  // Keep layout as-is; menu overlays into the first 26px of content area visually as VS Code does under title.

  // activity bar — highlight icon matching current action
  const activeIcon =
    S.actionKind === 'run' ? 3
    : S.actionKind === 'open' || S.actionKind === 'create' ? 0
    : S.actionKind === 'type' || S.actionKind === 'highlight' ? 0
    : 0;
  ctx.fillStyle = IDE.activity; ctx.fillRect(win.x, cy, AB, ch);
  ['files', 'search', 'git', 'run', 'ext'].forEach((ic, i) => drawActivityIcon(ctx, ic, win.x + AB / 2, cy + 42 + i * 52, i === activeIcon));
  ctx.fillStyle = C.accent; ctx.fillRect(win.x, cy + 42 + activeIcon * 52 - 16, 2.5, 32);

  // explorer
  ctx.fillStyle = IDE.side; ctx.fillRect(exX, cy, EXw, ch);
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.round(H / 90)}px ${MONO}`;
  ctx.fillStyle = IDE.dim; ctx.fillText('EXPLORER', exX + 18, cy + 24);
  ctx.font = `700 ${Math.round(H / 78)}px ${MONO}`;
  ctx.fillStyle = IDE.text; ctx.fillText(`▾ ${(scene.project || 'workspace').toUpperCase()}`, exX + 14, cy + 56);

  const tree = flattenFileTree(buildFileTree(S.visible));
  const rowIndexOf = new Map(tree.map((n, i) => [n.path, i] as const));
  ctx.font = `${Math.round(H / 74)}px ${MONO}`;
  tree.forEach((node, r) => {
    const rTop = L.treeTop + r * L.rowH;
    const mid = rTop + L.rowH / 2;
    if (rTop + L.rowH > cy + ch) return;
    const first = S.firstSeen.get(node.path) ?? -1;
    const fresh = node.isFile && first === S.k && first >= 0;
    const rowA = fresh ? clamp(S.rawP * 1.6, 0, 1) : 1;
    const slide = fresh ? (1 - rowA) * 12 : 0;
    ctx.save(); ctx.globalAlpha = a * rowA;
    const isActive = node.isFile && node.path === S.active;
    if (isActive) {
      ctx.fillStyle = IDE.rowActive; ctx.fillRect(exX, rTop, EXw, L.rowH);
      ctx.fillStyle = C.accent; ctx.fillRect(exX, rTop, 2, L.rowH);
    }
    const ix = exX + 20 + node.depth * 15 + slide;
    if (!node.isFile) {
      ctx.fillStyle = IDE.dim; ctx.fillText('▾', ix - 12, mid);
      ctx.fillStyle = IDE.text; ctx.fillText(node.name, ix + 6, mid);
    } else {
      const creatingThis = S.creating && S.creating.file === node.path;
      const label = creatingThis ? (node.name.slice(0, S.creating!.reveal) + (Math.floor(time * 2) % 2 ? '│' : '')) : node.name;
      ctx.beginPath(); ctx.fillStyle = fileColor(node.path); ctx.arc(ix + 2, mid, 3.5, 0, Math.PI * 2); ctx.fill();
      if (creatingThis) { ctx.strokeStyle = withAlpha(C.accent, 0.7); ctx.lineWidth = 1.2; roundRect(ctx, ix + 10, rTop + 4, EXw - node.depth * 15 - 40, L.rowH - 8, 4); ctx.stroke(); }
      ctx.fillStyle = isActive ? IDE.active : IDE.text; ctx.fillText(label, ix + 14, mid);
      if (S.typing && S.typing.file === node.path) { ctx.beginPath(); ctx.fillStyle = IDE.text; ctx.arc(exX + EXw - 18, mid, 4, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  });

  // editor tabs (last-opened slides in)
  ctx.fillStyle = IDE.tabbar; ctx.fillRect(edX, cy, edW, TB);
  ctx.font = `500 ${Math.round(TB * 0.35)}px ${MONO}`;
  const mW = ctx.measureText('M').width;
  let tx = edX;
  S.opened.forEach((f, ti) => {
    const name = f.split('/').pop()!;
    const tw = name.length * mW + 66;
    const isA = f === S.active;
    const last = ti === S.opened.length - 1;
    const slideA = last && isA ? clamp(S.rawP * 2, 0, 1) : 1;
    ctx.save(); ctx.globalAlpha = a * (0.4 + 0.6 * slideA);
    ctx.fillStyle = isA ? IDE.bg : IDE.tabInactive; ctx.fillRect(tx, cy, tw, TB);
    if (isA) { ctx.fillStyle = C.accent; ctx.fillRect(tx, cy, tw, 2); }
    ctx.fillStyle = IDE.line; ctx.fillRect(tx + tw - 1, cy, 1, TB);
    ctx.beginPath(); ctx.fillStyle = fileColor(f); ctx.arc(tx + 18, cy + TB / 2, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = isA ? IDE.active : IDE.dim; ctx.textBaseline = 'middle'; ctx.fillText(name, tx + 32, cy + TB / 2 + 1);
    ctx.strokeStyle = IDE.dim; ctx.lineWidth = 1.4; const xX = tx + tw - 18, xY = cy + TB / 2;
    ctx.beginPath(); ctx.moveTo(xX - 4, xY - 4); ctx.lineTo(xX + 4, xY + 4); ctx.moveTo(xX + 4, xY - 4); ctx.lineTo(xX - 4, xY + 4); ctx.stroke();
    ctx.restore();
    tx += tw;
  });
  ctx.fillStyle = IDE.line; ctx.fillRect(edX, cy + TB - 1, edW, 1);

  const { termH, codeH } = ideEditorSplit(L, S.term.length > 0);

  // breadcrumbs bar (folder › file, under the tabs)
  const BC = 30;
  if (S.active) {
    ctx.fillStyle = IDE.bg; ctx.fillRect(edX, cy + TB, edW, BC);
    ctx.font = `400 ${Math.round(H / 94)}px ${MONO}`; ctx.textBaseline = 'middle';
    const parts = S.active.split('/');
    let bx = edX + 18; const by = cy + TB + BC / 2 + 1;
    parts.forEach((part, pi) => {
      const isLast = pi === parts.length - 1;
      if (isLast) { ctx.beginPath(); ctx.fillStyle = fileColor(S.active!); ctx.arc(bx + 3, by - 1, 3, 0, Math.PI * 2); ctx.fill(); bx += 12; }
      ctx.fillStyle = isLast ? IDE.text : IDE.dim; ctx.fillText(part, bx, by);
      bx += ctx.measureText(part).width + 8;
      if (!isLast) { ctx.fillStyle = IDE.dim; ctx.fillText('›', bx, by); bx += ctx.measureText('›').width + 8; }
    });
    ctx.fillStyle = IDE.line; ctx.fillRect(edX, cy + TB + BC, edW, 1);
  }

  // editor code
  if (S.active) {
    const code = S.buffers.get(S.active) || '';
    const lang = langOf(S.active);
    const initialLines = (scene.files.find((f) => f.path === S.active)?.code || '').split('\n');
    const initialCount = initialLines[0] === '' && initialLines.length === 1 ? 0 : initialLines.length;
    const toks = prep.ideTokens.get(idx)?.get(`${lang}:::${code}`) || plainTokens(code);
    const fs = L.fs, lh = L.lh;
    ctx.font = `${fs}px ${MONO}`; ctx.textBaseline = 'alphabetic';
    const charW = ctx.measureText('M').width;
    const MM = 92; // minimap width
    const codeAreaTop = L.edBodyY + BC;
    const codeAreaH = codeH - BC;
    const codeX = edX + L.gutterW + 14;
    const isTypingHere = !!(S.typing && S.typing.file === S.active);
    const shown = isTypingHere ? revealTokenLinesByLine(toks, S.typing!.perLine) : toks;
    const totalLines = toks.length;
    const caretLine = isTypingHere ? S.typing!.caretLine : totalLines - 1;
    // Lines to draw: up to the caret, plus any already-present ("kept") lines
    // below it. Not-yet-typed appended lines stay hidden so nothing pops in early.
    let lastLine = caretLine;
    if (isTypingHere) {
      for (let i = totalLines - 1; i > caretLine; i--) {
        if (S.typing!.perLine[i] >= Number.MAX_SAFE_INTEGER) { lastLine = i; break; }
      }
    }
    const shownCount = isTypingHere ? lastLine + 1 : totalLines;

    // Soft-wrap: a logical line wider than the editor becomes several hanging-
    // indented VISUAL rows, so code is never cut off at the right edge. All
    // scrolling/positioning below happens in visual-row space.
    const availCols = Math.max(8, Math.floor((edW - MM - L.gutterW - 30) / charW));
    type VisRow = { li: number; startCol: number; indentCols: number; toks: Tok[]; first: boolean };
    const visRows: VisRow[] = [];
    const firstVisOf: number[] = new Array(Math.max(shownCount, 1)).fill(0);
    for (let li = 0; li < shownCount; li++) {
      firstVisOf[li] = visRows.length;
      const lineToks = shown[li] || [];
      const lineLen = lineToks.reduce((a, t) => a + t.text.length, 0);
      if (lineLen <= availCols) { visRows.push({ li, startCol: 0, indentCols: 0, toks: lineToks, first: true }); continue; }
      const full = lineToks.map((t) => t.text).join('');
      const lead = full.match(/^[ \t]*/)?.[0].length || 0;
      const hang = Math.min(lead + 2, Math.floor(availCols * 0.4));
      const chars: { ch: string; color: string }[] = [];
      for (const t of lineToks) for (const ch of t.text) chars.push({ ch, color: t.color });
      let ci = 0, first = true;
      while (ci < chars.length) {
        const indent = first ? 0 : hang;
        const width = Math.max(4, availCols - indent);
        let end = Math.min(ci + width, chars.length);
        if (end < chars.length) {
          for (let k = end; k > ci + Math.floor(width * 0.5); k--) { if (chars[k - 1].ch === ' ') { end = k; break; } }
        }
        const segToks: Tok[] = [];
        for (let k = ci; k < end; k++) {
          const c = chars[k];
          const last = segToks[segToks.length - 1];
          if (last && last.color === c.color) last.text += c.ch; else segToks.push({ text: c.ch, color: c.color });
        }
        visRows.push({ li, startCol: ci, indentCols: indent, toks: segToks, first });
        ci = end; first = false;
      }
    }
    const totalVis = visRows.length;

    // caret's visual row = the last visual row of the caret's logical line
    const caretCol = isTypingHere ? (shown[caretLine]?.reduce((a, t) => a + t.text.length, 0) ?? 0) : 0;
    let caretVis = totalVis - 1;
    if (isTypingHere) {
      for (let v = 0; v < totalVis; v++) if (visRows[v].li === caretLine && visRows[v].startCol <= caretCol) caretVis = v;
    }
    const maxRows = Math.max(1, Math.floor((codeAreaH - 12) / lh));
    const lastLog = Math.max(0, shownCount - 1);
    const scroll = isTypingHere
      ? codeScroll(totalVis, caretVis, maxRows)
      : (S.hi && S.hi.file === S.active)
        ? codeScroll(totalVis, firstVisOf[clamp(Math.round((S.hi.start + S.hi.end) / 2) - 1, 0, lastLog)], maxRows)
        : Math.max(0, totalVis - maxRows);
    let caret: { x: number; y: number; frag: string } | null = null;

    ctx.save();
    ctx.beginPath(); ctx.rect(edX, codeAreaTop, edW - MM, codeAreaH); ctx.clip();
    if (S.hi && S.hi.file === S.active) {
      const vStart = firstVisOf[clamp(S.hi.start - 1, 0, lastLog)];
      const heLog = clamp(S.hi.end - 1, 0, lastLog);
      const vEnd = (heLog + 1 < shownCount ? firstVisOf[heLog + 1] : totalVis) - 1;
      const s0 = vStart - scroll, e0 = vEnd - scroll;
      if (e0 >= 0 && s0 < maxRows) {
        const yTop = codeAreaTop + 8 + Math.max(0, s0) * lh;
        const yH = (Math.min(e0, maxRows - 1) - Math.max(0, s0) + 1) * lh;
        ctx.fillStyle = withAlpha(C.accent, 0.13); ctx.fillRect(edX, yTop, edW - MM, yH);
        ctx.fillStyle = C.accent; ctx.fillRect(edX, yTop, 3, yH);
      }
    }
    for (let r = 0; r < maxRows; r++) {
      const v = r + scroll; if (v >= totalVis) break;
      const vr = visRows[v];
      const li = vr.li;
      const y = codeAreaTop + 8 + fs + r * lh;
      const lineText = vr.toks.map((t) => t.text).join('');
      // current line highlight spans every visual row of the caret's logical line
      if (isTypingHere && li === caretLine) {
        ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(edX, y - fs - 2, edW - MM, lh);
      }
      ctx.font = `${fs}px ${MONO}`;
      if (vr.first) {
        // indent guides
        const indent = (lineText.match(/^[ \t]*/)?.[0].length || 0);
        const spaces = lineText.startsWith('\t') ? indent * 2 : indent;
        for (let g = 2; g <= spaces; g += 2) {
          ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
          const gx = codeX + g * charW;
          ctx.beginPath(); ctx.moveTo(gx, y - fs); ctx.lineTo(gx, y + 4); ctx.stroke();
        }
        // git gutter: new lines green, changed lines blue
        const fullLineText = (shown[li] || []).map((t) => t.text).join('');
        const git = li >= initialCount ? '#3fb950' : (fullLineText.trim() && fullLineText !== initialLines[li] ? '#58a6ff' : null);
        if (git) { ctx.fillStyle = git; ctx.fillRect(edX + L.gutterW - 3, y - fs, 2.5, fs + 3); }
        ctx.fillStyle = IDE.dim; ctx.textAlign = 'right';
        ctx.fillText(String(li + 1), edX + L.gutterW - 10, y); ctx.textAlign = 'left';
      } else {
        // wrapped continuation: a subtle marker where the line number would be
        ctx.fillStyle = withAlpha(IDE.dim, 0.5); ctx.textAlign = 'right';
        ctx.fillText('⋯', edX + L.gutterW - 10, y); ctx.textAlign = 'left';
      }
      let x = codeX + vr.indentCols * charW;
      for (const t of vr.toks) { ctx.fillStyle = t.color; ctx.fillText(t.text, x, y); x += t.text.length * charW; }
      if (isTypingHere && li === caretLine && v === caretVis) {
        const cx = codeX + vr.indentCols * charW + (caretCol - vr.startCol) * charW;
        if (Math.floor(time * 1.8) % 2 === 0) {
          ctx.fillStyle = C.accent; ctx.fillRect(cx + 1, y - fs, Math.max(2, charW * 0.5), fs + 3);
        }
        caret = { x: cx, y, frag: (lineText.match(/[A-Za-z_][A-Za-z0-9_]*$/) || [''])[0] };
      }
    }
    ctx.restore();

    // minimap (scaled code overview on the right edge)
    const mmX = edX + edW - MM;
    ctx.save();
    ctx.beginPath(); ctx.rect(mmX, codeAreaTop, MM, codeAreaH); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.018)'; ctx.fillRect(mmX, codeAreaTop, MM, codeAreaH);
    const mmLineH = clamp((codeAreaH - 12) / Math.max(shownCount, 1) - 1, 1.5, 3.2);
    for (let li = 0; li < shownCount; li++) {
      const yy = codeAreaTop + 6 + li * (mmLineH + 1);
      if (yy > codeAreaTop + codeAreaH - mmLineH) break;
      let xx = mmX + 8;
      for (const t of shown[li]) { if (!t.text.trim()) { xx += t.text.length * 1.2; continue; } const w = Math.min(t.text.length * 1.3, mmX + MM - 10 - xx); if (w > 0) { ctx.fillStyle = withAlpha(t.color, 0.55); ctx.fillRect(xx, yy, w, mmLineH); xx += w + 1.5; } }
    }
    if (shownCount > maxRows) { const vpY = codeAreaTop + 6 + scroll * (mmLineH + 1); ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(mmX, vpY, MM, maxRows * (mmLineH + 1)); }
    ctx.fillStyle = IDE.line; ctx.fillRect(mmX, codeAreaTop, 1, codeAreaH);
    ctx.restore();

    // IntelliSense popup at the caret (+ occasional Tab accept mid-type)
    if (caret && caret.frag.length >= 2) {
      const sugg = autocompleteSuggestions(lang, caret.frag);
      if (sugg.length) {
        const afs = Math.round(fs * 0.8), arh = Math.round(afs * 1.95);
        ctx.font = `${afs}px ${MONO}`;
        const wgt = Math.max(...sugg.map((s) => ctx.measureText(s).width)) + afs * 3.6;
        const ax = clamp(caret.x - afs, edX, edX + edW - MM - wgt - 8);
        let ay = caret.y + 10; const ah = sugg.length * arh + 8;
        if (ay + ah > codeAreaTop + codeAreaH) ay = caret.y - fs - ah - 4;
        const acceptBeat = S.rawP > 0.38 && S.rawP < 0.52;
        ctx.fillStyle = '#252526'; roundRect(ctx, ax, ay, wgt, ah, 6); ctx.fill();
        ctx.strokeStyle = withAlpha(C.accent, 0.4); ctx.lineWidth = 1; roundRect(ctx, ax, ay, wgt, ah, 6); ctx.stroke();
        sugg.forEach((sg, si) => {
          const ry = ay + 4 + si * arh;
          if (si === 0) { ctx.fillStyle = withAlpha(C.accent, acceptBeat ? 0.38 : 0.24); ctx.fillRect(ax + 2, ry, wgt - 4, arh); }
          ctx.fillStyle = si === 0 ? C.accent : IDE.dim; roundRect(ctx, ax + 10, ry + arh / 2 - afs * 0.32, afs * 0.66, afs * 0.66, 2); ctx.fill();
          const mx = ax + afs * 2.3; ctx.textBaseline = 'middle';
          ctx.font = `${afs}px ${MONO}`;
          ctx.fillStyle = C.accent; ctx.fillText(sg.slice(0, caret!.frag.length), mx, ry + arh / 2 + 1);
          const pw = ctx.measureText(sg.slice(0, caret!.frag.length)).width;
          ctx.fillStyle = IDE.text; ctx.fillText(sg.slice(caret!.frag.length), mx + pw, ry + arh / 2 + 1);
        });
        if (acceptBeat) {
          const chip = 'Tab';
          ctx.font = `700 ${Math.round(afs * 0.85)}px ${SANS}`;
          const cw = ctx.measureText(chip).width + 14;
          const cx = ax + wgt - cw - 6, cy = ay + 6;
          ctx.fillStyle = withAlpha(C.accent, 0.9); roundRect(ctx, cx, cy, cw, afs + 8, 4); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(chip, cx + 7, cy + (afs + 8) / 2 + 1);
        }
        ctx.textBaseline = 'alphabetic';
      }
    }
  }

  // integrated terminal
  if (S.term.length > 0) {
    const tY = L.edBodyY + codeH;
    const THh = 32;
    ctx.fillStyle = IDE.termHdr; ctx.fillRect(edX, tY, edW, THh);
    ctx.fillStyle = IDE.line; ctx.fillRect(edX, tY, edW, 1);
    ctx.font = `600 ${Math.round(THh * 0.34)}px ${MONO}`; ctx.textBaseline = 'middle';
    let hx = edX + 20;
    ['PROBLEMS', 'OUTPUT', 'TERMINAL', 'PORTS'].forEach((t) => {
      const on = t === 'TERMINAL';
      ctx.fillStyle = on ? IDE.active : IDE.dim; ctx.fillText(t, hx, tY + THh / 2 + 1);
      const w = t.length * ctx.measureText('M').width * 0.62;
      if (on) { ctx.fillStyle = C.accent; ctx.fillRect(hx, tY + THh - 2, w, 2); }
      hx += w + 24;
    });
    const bY = tY + THh, bH = termH - THh;
    ctx.fillStyle = IDE.termBg; ctx.fillRect(edX, bY, edW, bH);
    ctx.save();
    ctx.beginPath(); ctx.rect(edX, bY, edW, bH); ctx.clip();
    const tfs = Math.round(H / 46), tlh = Math.round(tfs * 1.5);
    ctx.font = `${tfs}px ${MONO}`; ctx.textBaseline = 'alphabetic';
    const tcw = ctx.measureText('M').width;
    type Seg = { text: string; color: string };
    const rows: Seg[][] = [];
    let streaming = false;
    S.term.forEach((blk) => {
      const cmd = blk.command.slice(0, Math.ceil(blk.command.length * blk.cmdP));
      rows.push([{ text: '❯', color: IDE.termGreen }, { text: `  ${scene.project || '~'} `, color: IDE.termCyan }, { text: cmd, color: IDE.active }]);
      const out = blk.output.slice(0, Math.ceil(blk.output.length * blk.outP));
      if (out) for (const ln of out.split('\n')) rows.push([{ text: ln, color: termLineColor(ln) }]);
      if (blk.cmdP >= 1 && blk.outP < 1 && blk.output) streaming = true;
    });
    if (streaming) { const sp = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'; rows.push([{ text: sp[Math.floor(time * 12) % sp.length], color: IDE.termGreen }]); }
    const tmax = Math.max(1, Math.floor((bH - 10) / tlh));
    const tscroll = Math.max(0, rows.length - tmax);
    for (let r = 0; r < tmax; r++) {
      const ri = r + tscroll; if (ri >= rows.length) break;
      const y = bY + 8 + tfs + r * tlh;
      let x = edX + 20;
      for (const sg of rows[ri]) { ctx.fillStyle = sg.color; ctx.fillText(sg.text, x, y); x += sg.text.length * tcw; }
      if (ri === rows.length - 1 && !streaming && Math.floor(time * 1.6) % 2 === 0) {
        ctx.fillStyle = IDE.text; ctx.fillRect(x + 2, y - tfs, tcw * 0.55, tfs);
      }
    }
    ctx.restore();
  }

  // mouse: explorer row (open/create), terminal tab / command line (run)
  {
    const fromX = edX + edW * 0.4, fromY = cy + ch * 0.45;
    let targetX: number | null = null, targetY: number | null = null;
    if (S.clickTarget && (S.actionKind === 'open' || S.actionKind === 'create')) {
      const ri = rowIndexOf.get(S.clickTarget);
      if (ri != null) {
        // open: glide to explorer, then to the editor tab once the file is focused
        if (S.actionKind === 'open' && S.rawP > 0.55) {
          let tabX = edX;
          for (const f of S.opened) {
            const name = f.split('/').pop()!;
            const tw = name.length * mW + 66;
            if (f === S.clickTarget) { targetX = tabX + tw / 2; targetY = cy + TB / 2; break; }
            tabX += tw;
          }
        }
        if (targetX == null) {
          targetX = exX + 40;
          targetY = L.treeTop + ri * L.rowH + L.rowH / 2;
        }
      }
    } else if (S.actionKind === 'run' && S.term.length > 0) {
      const tY = L.edBodyY + codeH;
      if (S.rawP < 0.35) {
        targetX = edX + 20 + 3 * 90;
        targetY = tY + 16;
      } else {
        targetX = edX + 80;
        targetY = tY + 48;
      }
    }
    if (targetX != null && targetY != null) {
      const mv = easeOutCubic(clamp(S.rawP / 0.42, 0, 1));
      const cxp = lerp(fromX, targetX, mv), cyp = lerp(fromY, targetY, mv);
      if (S.rawP > 0.4 && S.rawP < 0.72) {
        const rp = (S.rawP - 0.4) / 0.32;
        ctx.beginPath(); ctx.strokeStyle = withAlpha(C.accent, 0.6 * (1 - rp)); ctx.lineWidth = 2;
        ctx.arc(targetX, targetY, 6 + rp * 22, 0, Math.PI * 2); ctx.stroke();
      }
      drawMouseCursor(ctx, cxp, cyp, 1);
    }
  }

  // status bar
  const sbY = cy + ch;
  ctx.fillStyle = C.accentDeep; ctx.fillRect(win.x, sbY, win.w, SB);
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.round(SB * 0.42)}px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  const branch = scene.branch || 'main';
  ctx.fillText(`⎇ ${branch}`, win.x + 18, sbY + SB / 2 + 1);
  if (S.caption) {
    ctx.font = `500 ${Math.round(SB * 0.38)}px ${SANS}`;
    ctx.fillText(S.caption, win.x + 110, sbY + SB / 2 + 1);
  }
  ctx.textAlign = 'right';
  const alang = S.active ? langOf(S.active) : 'text';
  let ln = 1, col = 1;
  if (S.typing && S.typing.file === S.active) {
    ln = S.typing.caretLine + 1;
    col = S.typing.caretCol + 1;
  }
  ctx.font = `500 ${Math.round(SB * 0.38)}px ${SANS}`;
  ctx.fillText(`Ln ${ln}, Col ${col}   ${alang}   UTF-8   LF   Spaces: 2`, win.x + win.w - 18, sbY + SB / 2 + 1);
  ctx.textAlign = 'left';

  // keystroke / shortcut chip
  if (S.overlay && S.rawP < 0.85) {
    const chipA = clamp((1 - S.rawP) * 3, 0, 1);
    ctx.save(); ctx.globalAlpha = a * chipA;
    ctx.font = `700 ${Math.round(H / 44)}px ${MONO}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    const cw = ctx.measureText(S.overlay).width + 40;
    const cxp = win.x + win.w / 2, cyp = win.y + win.h - 60;
    ctx.fillStyle = 'rgba(20,20,26,0.92)'; roundRect(ctx, cxp - cw / 2, cyp - 26, cw, 52, 12); ctx.fill();
    ctx.strokeStyle = withAlpha(C.accent, 0.5); ctx.lineWidth = 1.4; roundRect(ctx, cxp - cw / 2, cyp - 26, cw, 52, 12); ctx.stroke();
    ctx.fillStyle = IDE.active; ctx.fillText(S.overlay, cxp, cyp + 1); ctx.textAlign = 'left';
    ctx.restore();
  }

  ctx.restore(); // window clip
  ctx.restore(); // globalAlpha
}

/** Compact IDE draw into an arbitrary pane (layout regions). */
export function drawIdePane(
  ctx: CanvasRenderingContext2D,
  prep: Prepared,
  scene: IdeScene,
  time: number,
  pane: Rect,
) {
  // Reuse full IDE card by scaling: draw into offscreen-like transform
  const W = prep.dsl.width;
  const H = prep.dsl.height;
  const scaleX = pane.w / (W * 0.88);
  const scaleY = pane.h / (H * 0.82);
  const scale = Math.min(scaleX, scaleY);
  ctx.save();
  ctx.translate(pane.x, pane.y);
  ctx.scale(scale, scale);
  ctx.translate(-W * 0.06, -H * 0.055);
  drawIdeCard(ctx, prep, scene, time, W, H);
  ctx.restore();
}
