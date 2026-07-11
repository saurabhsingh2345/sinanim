// Shared canvas-render primitives: theme-mutated palettes (C / IDE / ACTIVE_*),
// fonts, geometry helpers, window chrome, and token utilities used by both the
// core renderer and the per-template modules under lib/render/.
//
// C is REASSIGNED by applyThemePack every frame, so it must live in the same
// module (ESM live bindings let importers see the swap; they must not write it).
import { AnimationDSL, Easing } from '../types';
import { Tok } from '../highlight';
import { clamp, easeInOut, easeInCubic, easeOutCubic, easeOutBack, parseHex } from '../utils';
import { resolveTheme, ThemePack, DEFAULT_THEME_ID } from '../themes';

// ── Palette / constants (mutated per-frame from ThemePack) ─────────────────────
export let C = {
  panel: '#16161d',
  panelTop: 'rgba(255,255,255,0.035)',
  border: 'rgba(255,255,255,0.09)',
  borderTop: 'rgba(255,255,255,0.14)',
  sep: 'rgba(255,255,255,0.06)',
  text: '#ecebf2',
  dim: '#8b8a97',
  faint: 'rgba(255,255,255,0.28)',
  terminal: '#7ee2a8',
  prompt: '#6b7280',
  accent: '#a78bfa',
  accentDeep: '#8b5cf6',
  green: '#34d399',
  red: '#f87171',
  trafficRed: '#ff5f57',
  trafficYellow: '#febc2e',
  trafficGreen: '#28c840',
};

export let ACTIVE_PACK: ThemePack = resolveTheme(DEFAULT_THEME_ID);
export let ACTIVE_BLOB_A = ACTIVE_PACK.blobA;
export let ACTIVE_BLOB_B = ACTIVE_PACK.blobB;

export function applyThemePack(pack: ThemePack) {
  ACTIVE_PACK = pack;
  ACTIVE_BLOB_A = pack.blobA;
  ACTIVE_BLOB_B = pack.blobB;
  C = { ...pack.panel };
  IDE.bg = pack.ide.bg;
  IDE.title = pack.ide.title;
  IDE.activity = pack.ide.activity;
  IDE.side = pack.ide.side;
  IDE.rowActive = pack.ide.rowActive;
  IDE.tabbar = pack.ide.tabbar;
  IDE.tabInactive = pack.ide.tabInactive;
  IDE.line = pack.ide.line;
  IDE.text = pack.ide.text;
  IDE.active = pack.ide.active;
  IDE.dim = pack.ide.dim;
  IDE.termBg = pack.ide.termBg;
  IDE.termHdr = pack.ide.termHdr;
  IDE.termGreen = pack.ide.termGreen;
  IDE.termCyan = pack.ide.termCyan;
  IDE.termRed = pack.ide.termRed;
  IDE.termOut = pack.ide.termOut;
}

export const MONO = "'JetBrains Mono', 'Menlo', 'Consolas', monospace";
export const SANS = "'SF Pro Text', 'Segoe UI', 'Helvetica Neue', system-ui, sans-serif";
export const CHAR_FADE = 0.16; // per-character fade-in (s, terminal output)
export const WIN_ANIM = 0.5; // window entrance (s)
export const TITLE_H = 52;
export const PAD = 36;

export interface Rect { x: number; y: number; w: number; h: number; }

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** RoughJS-inspired jittered rounded rect for diagram "sketch" aesthetic. */
export function sketchRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const j = (n: number) => n + (Math.sin(n * 12.9898) * 43758.5453 % 1) * 2.4 - 1.2;
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(j(x + rr), j(y));
  ctx.lineTo(j(x + w - rr), j(y));
  ctx.quadraticCurveTo(j(x + w), j(y), j(x + w), j(y + rr));
  ctx.lineTo(j(x + w), j(y + h - rr));
  ctx.quadraticCurveTo(j(x + w), j(y + h), j(x + w - rr), j(y + h));
  ctx.lineTo(j(x + rr), j(y + h));
  ctx.quadraticCurveTo(j(x), j(y + h), j(x), j(y + h - rr));
  ctx.lineTo(j(x), j(y + rr));
  ctx.quadraticCurveTo(j(x), j(y), j(x + rr), j(y));
  ctx.closePath();
}

// Width-aware: vertical (9:16 shorts) frames cap the size so code lines fit.
export function codeFont(s: { fontSize?: number }, dsl: AnimationDSL) {
  return s.fontSize || Math.round(Math.min(dsl.height / 36, dsl.width / 26));
}
export function lineH(fs: number) { return Math.round(fs * 1.6); }

export function withAlpha(hex: string, a: number): string {
  const c = parseHex(hex);
  return c ? `rgba(${c.r},${c.g},${c.b},${a})` : hex;
}

/** Simple word wrap against the current ctx font. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && ctx.measureText(next).width > maxW) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Wrap + auto-shrink: find the largest font size ≤ baseFs whose wrapped lines
 *  fit maxW within maxLines. Text is NEVER cut off — it shrinks instead.
 *  Leaves ctx.font set to the winning size. */
export function fitLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  baseFs: number,
  opts?: { minFs?: number; maxLines?: number; weight?: number | string; family?: string },
): { fs: number; lines: string[] } {
  const family = opts?.family ?? MONO;
  const weight = opts?.weight ?? 700;
  const minFs = Math.max(11, opts?.minFs ?? Math.round(baseFs * 0.5));
  const maxLines = opts?.maxLines ?? 3;
  let fs = baseFs;
  for (;;) {
    ctx.font = `${weight} ${fs}px ${family}`;
    const lines = wrapText(ctx, text, maxW);
    const widest = lines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0);
    if ((lines.length <= maxLines && widest <= maxW) || fs <= minFs) return { fs, lines };
    fs = Math.max(minFs, Math.round(fs * 0.92));
  }
}

export const EASE: Record<Easing, (t: number) => number> = {
  linear: (t) => clamp(t, 0, 1),
  easeInOut,
  easeInCubic,
  easeOutCubic,
  easeOutBack,
};

export function cardAlpha(scene: { startTime: number; duration: number }, time: number, fade = 0.35): number {
  const el = time - scene.startTime;
  let a = 1;
  if (el < fade) a = easeInOut(el / fade);
  else if (el > scene.duration - fade) a = easeInOut((scene.duration - el) / fade);
  return clamp(a, 0, 1);
}

export const IDE = {
  bg: '#1e1e1e',
  title: '#3c3c3c',
  activity: '#2c2c2c',
  side: '#252526',
  rowActive: 'rgba(255,255,255,0.06)',
  tabbar: '#252526',
  tabInactive: '#2d2d2d',
  line: '#1a1a1a',
  text: '#cfcfd4',
  active: '#ffffff',
  dim: '#7f7f88',
  termBg: '#181818',
  termHdr: '#252526',
  termGreen: '#7ee2a8',
  termCyan: '#56b6c2',
  termRed: '#f87171',
  termOut: '#c9c9cf',
};

export function fileColor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const m: Record<string, string> = {
    py: '#4b8bbe', js: '#f1e05a', mjs: '#f1e05a', ts: '#3178c6', tsx: '#3178c6',
    jsx: '#61dafb', json: '#cbcb41', html: '#e34c26', css: '#42a5f5', scss: '#c6538c',
    md: '#519aba', go: '#00add8', rs: '#dea584', java: '#b07219', rb: '#701516',
    sh: '#89e051', yml: '#cb171e', yaml: '#cb171e', c: '#555555', cpp: '#f34b7d',
  };
  return m[ext] || '#9aa0a6';
}

export function plainTokens(code: string): Tok[][] {
  return code.split('\n').map((l) => [{ text: l, color: IDE.text }]);
}

/** Reveal the first `n` characters of tokenized code (newlines count as 1). */
export function revealTokenLines(tokens: Tok[][], n: number): Tok[][] {
  if (n >= Number.MAX_SAFE_INTEGER) return tokens;
  const out: Tok[][] = [];
  let count = 0;
  for (let li = 0; li < tokens.length; li++) {
    const line: Tok[] = [];
    for (const t of tokens[li]) {
      const remaining = n - count;
      if (remaining <= 0) break;
      line.push(remaining >= t.text.length ? t : { text: t.text.slice(0, remaining), color: t.color });
      count += t.text.length;
    }
    out.push(line);
    count += 1; // the newline joining this line to the next
    if (count > n) break;
  }
  return out.length ? out : [[]];
}

export function drawMouseCursor(ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(0, 20); ctx.lineTo(5, 15); ctx.lineTo(9, 23); ctx.lineTo(12, 21); ctx.lineTo(8, 14); ctx.lineTo(15, 14); ctx.closePath();
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1.4;
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

/** Colour a terminal output line by its content (errors, success, urls, paths). */
export function termLineColor(text: string): string {
  const t = text.trim();
  if (/^(error|err|traceback|exception|✗|×|fail)/i.test(t) || /error:/i.test(t)) return IDE.termRed;
  if (/(✓|success|passed|done|ok\b|✔)/i.test(t)) return IDE.termGreen;
  if (/https?:\/\//i.test(t)) return IDE.termCyan;
  if (/^[+\-]?\s*\d+(\.\d+)?\s*(ms|s|kb|mb|gb|%)/i.test(t)) return IDE.termCyan;
  return IDE.termOut;
}

export function drawWindowFrame(ctx: CanvasRenderingContext2D, win: Rect, title: string, titleBg: string, bodyBg: string, TH: number) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 26;
  ctx.fillStyle = bodyBg;
  roundRect(ctx, win.x, win.y, win.w, win.h, 14); ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, win.x, win.y, win.w, win.h, 14); ctx.clip();
  ctx.fillStyle = titleBg; ctx.fillRect(win.x, win.y, win.w, TH);
  [C.trafficRed, C.trafficYellow, C.trafficGreen].forEach((c, i) => {
    ctx.beginPath(); ctx.fillStyle = c; ctx.arc(win.x + 26 + i * 22, win.y + TH / 2, 6, 0, Math.PI * 2); ctx.fill();
  });
  ctx.font = `500 ${Math.round(TH * 0.32)}px ${MONO}`;
  ctx.fillStyle = IDE.dim; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(title, win.x + win.w / 2, win.y + TH / 2 + 1);
  ctx.textAlign = 'left';
}

export function drawTemplateCaption(ctx: CanvasRenderingContext2D, text: string, win: Rect, H: number) {
  ctx.font = `600 ${Math.round(H / 58)}px ${MONO}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const cw = ctx.measureText(text).width + 34;
  const x = win.x + 22, y = win.y + win.h - 30;
  ctx.fillStyle = 'rgba(10,10,14,0.82)'; roundRect(ctx, x, y - 19, cw, 38, 10); ctx.fill();
  ctx.strokeStyle = withAlpha(C.accent, 0.4); ctx.lineWidth = 1.2; roundRect(ctx, x, y - 19, cw, 38, 10); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.fillText(text, x + 17, y + 1);
}

export function langLabel(lang: string): string {
  const map: Record<string, string> = {
    python: 'main.py', py: 'main.py', javascript: 'index.js', js: 'index.js',
    typescript: 'index.ts', ts: 'index.ts', tsx: 'app.tsx', jsx: 'app.jsx',
    bash: 'script.sh', sh: 'script.sh', go: 'main.go', rust: 'main.rs',
    java: 'Main.java', cpp: 'main.cpp', c: 'main.c', html: 'index.html',
    css: 'style.css', json: 'data.json', sql: 'query.sql',
  };
  return map[lang.toLowerCase()] || lang;
}
