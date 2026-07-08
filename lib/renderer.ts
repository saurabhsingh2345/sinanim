import { AnimationDSL, CodeScene, Easing, SpriteScene, TerminalScene, TextScene } from './types';
import { tokenizeCode } from './highlight';
import { TEMPLATES, SpriteState } from './templates';
import { clamp, easeInOut, easeInCubic, easeOutCubic, easeOutBack, lerp } from './utils';
import { typeSchedule, revealedCount } from './timing';

// ── Prepared timeline ─────────────────────────────────────────────────────────
export interface CharCell {
  ch: string;
  color: string;
}

export interface Prepared {
  dsl: AnimationDSL;
  /** sceneIndex -> lines of individually-colored characters (no newlines) */
  code: Map<number, CharCell[][]>;
  /** sceneIndex -> per-character reveal times (human typing w/ per-line pauses) */
  schedule: Map<number, number[]>;
}

export async function prepare(dsl: AnimationDSL): Promise<Prepared> {
  const code = new Map<number, CharCell[][]>();
  const schedule = new Map<number, number[]>();
  await Promise.all(
    dsl.scenes.map(async (s, i) => {
      if (s.type === 'code') {
        const toks = await tokenizeCode(s.code, s.language);
        code.set(
          i,
          toks.map((line) =>
            line.flatMap((t) => t.text.split('').map((ch) => ({ ch, color: t.color }))),
          ),
        );
        schedule.set(i, typeSchedule(s.code, s.typingSpeed));
      } else if (s.type === 'terminal') {
        schedule.set(i, typeSchedule(s.output, s.typingSpeed));
      }
    }),
  );
  return { dsl, code, schedule };
}

// ── Palette / constants ─────────────────────────────────────────────────────────
const C = {
  panel: '#15151b',
  panelTop: '#1b1b22',
  border: 'rgba(255,255,255,0.08)',
  sep: 'rgba(255,255,255,0.06)',
  text: '#e6e6ea',
  dim: '#8a8a96',
  terminal: '#4ade80',
  prompt: '#6b7280',
  pink: '#ff7b9c',
  cyan: '#22d3ee',
  green: '#34d399',
  yellow: '#fbbf24',
};
const MONO = "'JetBrains Mono', 'Menlo', 'Consolas', monospace";
const CHAR_FADE = 0.14; // per-character fade-in (s) — subtle, clean
const WIN_ANIM = 0.4; // window entrance (s)
const TITLE_H = 46;
const PAD = 34;

interface Rect { x: number; y: number; w: number; h: number; }

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function codeFont(s: CodeScene, dsl: AnimationDSL) { return s.fontSize || Math.round(dsl.height / 36); }
function lineH(fs: number) { return Math.round(fs * 1.6); }

// ── Public entry ────────────────────────────────────────────────────────────────
export function renderFrame(ctx: CanvasRenderingContext2D, prep: Prepared, time: number) {
  const { dsl } = prep;
  const W = dsl.width;
  const H = dsl.height;

  // clean, still background: flat colour + one soft static glow + light vignette
  ctx.fillStyle = dsl.backgroundColor;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H * 0.36, 0, W / 2, H * 0.36, W * 0.6);
  glow.addColorStop(0, 'rgba(34,211,238,0.05)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  drawContent(ctx, prep, time);

  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.5, W / 2, H / 2, H * 0.95);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}

function drawContent(ctx: CanvasRenderingContext2D, prep: Prepared, time: number) {
  const { dsl } = prep;
  const W = dsl.width, H = dsl.height;
  const contentW = Math.min(W - 220, 1380);
  const centerX = W / 2;

  // sprites render first, so code/terminal panels and captions sit on top
  drawSprites(ctx, dsl, time);

  const codeIdx = lastStartedIndex(dsl, 'code', time);
  const termIdx = lastStartedIndex(dsl, 'terminal', time);

  const panels: { kind: 'code' | 'terminal'; idx: number; h: number }[] = [];
  if (codeIdx >= 0) {
    const s = dsl.scenes[codeIdx] as CodeScene;
    const fs = codeFont(s, dsl);
    const lines = Math.max(1, prep.code.get(codeIdx)?.length ?? 1);
    panels.push({ kind: 'code', idx: codeIdx, h: TITLE_H + PAD * 2 + Math.min(lines, 18) * lineH(fs) });
  }
  if (termIdx >= 0) {
    const s = dsl.scenes[termIdx] as TerminalScene;
    const fs = s.fontSize || Math.round(H / 38);
    const lines = Math.max(1, s.output.split('\n').length + 1);
    panels.push({ kind: 'terminal', idx: termIdx, h: TITLE_H + PAD * 1.5 + Math.min(lines, 12) * lineH(fs) });
  }

  const gap = 40;
  const totalH = panels.reduce((a, p) => a + p.h, 0) + gap * Math.max(0, panels.length - 1);
  let y = Math.max(120, (H - totalH) / 2);

  let codeRect: Rect | null = null;
  let runBtn: Rect | null = null;

  for (const p of panels) {
    const rect: Rect = { x: centerX - contentW / 2, y, w: contentW, h: p.h };
    const scene = dsl.scenes[p.idx];
    const age = time - scene.startTime;
    const enter = easeOutCubic(clamp(age / WIN_ANIM, 0, 1));

    ctx.save();
    // clean entrance: gentle fade + small rise (no scale, no float)
    ctx.globalAlpha = enter;
    ctx.translate(0, (1 - enter) * 16);

    if (p.kind === 'code') {
      const r = drawCodePanel(ctx, prep, p.idx, rect, time);
      codeRect = rect;
      runBtn = r.runBtn;
    } else {
      drawTerminalPanel(ctx, dsl.scenes[p.idx] as TerminalScene, rect, time, dsl);
    }
    ctx.restore();
    y += p.h + gap;
  }

  const hl = activeScene(dsl, 'highlight', time);
  if (hl && codeRect && codeIdx >= 0) {
    drawHighlight(ctx, hl as any, codeRect, dsl.scenes[codeIdx] as CodeScene, dsl, time);
  }

  const click = activeScene(dsl, 'click', time);
  if (runBtn) drawRunButton(ctx, runBtn, click ? clamp((time - click.startTime) / click.duration, 0, 1) : -1);
  if (click && runBtn) drawClickFx(ctx, runBtn, time, click.startTime);

  const text = activeScene(dsl, 'text', time) as TextScene | null;
  if (text) drawCaption(ctx, text, time, W, H);
}

// ── Sprites (template + keyframe tweens) ────────────────────────────────────────────
const EASE: Record<Easing, (t: number) => number> = {
  linear: (t) => clamp(t, 0, 1),
  easeInOut,
  easeInCubic,
  easeOutCubic,
  easeOutBack,
};

/** Fold a sprite's keyframes into a concrete transform at `time`. */
function spriteStateAt(scene: SpriteScene, time: number): SpriteState {
  const base = scene.scale || 1;
  const st: SpriteState = {
    x: scene.x,
    y: scene.y,
    scaleX: base,
    scaleY: base,
    rotation: 0,
    opacity: 1,
    props: scene.props || {},
  };
  const local = time - scene.startTime;
  // array order = priority: a later keyframe on the same prop that has begun wins,
  // which makes sequential moves (jump up, then fall down) compose naturally.
  for (const kf of scene.animations || []) {
    if (local < kf.start) continue;
    const p = (EASE[kf.easing || 'easeInOut'] || easeInOut)(
      clamp((local - kf.start) / kf.duration, 0, 1),
    );
    const v = lerp(kf.from, kf.to, p);
    if (kf.prop === 'scaleX') st.scaleX = base * v;
    else if (kf.prop === 'scaleY') st.scaleY = base * v;
    else st[kf.prop] = v;
  }
  return st;
}

function drawSprites(ctx: CanvasRenderingContext2D, dsl: AnimationDSL, time: number) {
  const W = dsl.width, H = dsl.height;
  const DT = 1 / 60; // sampling step for numeric velocity

  for (const s of dsl.scenes) {
    if (s.type !== 'sprite') continue;
    if (time < s.startTime - 1e-6 || time > s.startTime + s.duration) continue;
    const tmpl = TEMPLATES[s.template];
    if (!tmpl) continue;

    const st = spriteStateAt(s, time);

    // ── motion context: vertical velocity (px/s, + = downward) and height above
    //    the sprite's rest position (its base y). These drive squash/stretch,
    //    the contact shadow, and the character's own limb posing.
    const prev = spriteStateAt(s, Math.max(s.startTime, time - DT));
    const vy = ((st.y - prev.y) / DT) * H;
    const lift = Math.max(0, (s.y - st.y) * H);
    st.vy = vy;
    st.lift = lift;

    // ── automatic squash & stretch (skipped if the author keyframes scale) ──
    if (!s.animations.some((k) => k.prop === 'scaleX' || k.prop === 'scaleY')) {
      const groundK = clamp(1 - lift / 60, 0, 1); // 1 at the floor, 0 up high
      const mag = clamp(Math.abs(vy) / 1600, 0, 0.32);
      const stretch = mag * (1 - groundK); // tall when airborne & fast
      const squash = mag * groundK; // flat near the floor & fast (takeoff/impact)
      st.scaleY *= 1 + stretch - squash;
      st.scaleX *= 1 - stretch * 0.6 + squash * 0.7;
    }

    // ── contact shadow: sits at the rest position, shrinks & fades with height ──
    if (tmpl.castsShadow) {
      const liftN = clamp(lift / (H * 0.34), 0, 1);
      const r = (tmpl.shadowRadius ?? 56) * (s.scale || 1) * (1 - 0.5 * liftN);
      ctx.save();
      ctx.globalAlpha = clamp(st.opacity, 0, 1) * 0.32 * (1 - 0.65 * liftN);
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(st.x * W, s.y * H, r, r * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = clamp(st.opacity, 0, 1);
    ctx.translate(st.x * W, st.y * H);
    ctx.scale(st.scaleX, st.scaleY);
    ctx.rotate((st.rotation * Math.PI) / 180);
    tmpl.draw(ctx, st, W, H, time);
    ctx.restore();
  }
}

// ── Scene selection ───────────────────────────────────────────────────────────────
function lastStartedIndex(dsl: AnimationDSL, type: string, time: number): number {
  let best = -1, bestStart = -1;
  dsl.scenes.forEach((s, i) => {
    if (s.type === type && s.startTime <= time + 1e-6 && s.startTime >= bestStart) { best = i; bestStart = s.startTime; }
  });
  return best;
}
function activeScene(dsl: AnimationDSL, type: string, time: number) {
  return dsl.scenes.find((s) => s.type === type && time >= s.startTime - 1e-6 && time < s.startTime + s.duration) || null;
}

// ── Window chrome ─────────────────────────────────────────────────────────────────
function drawChrome(ctx: CanvasRenderingContext2D, rect: Rect, title: string): Rect {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 20;
  ctx.fillStyle = C.panel;
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 14);
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, rect.x, rect.y, rect.w, TITLE_H, 14);
  ctx.clip();
  ctx.fillStyle = C.panelTop;
  ctx.fillRect(rect.x, rect.y, rect.w, TITLE_H);
  ctx.restore();

  // neutral separator under the title bar
  ctx.fillStyle = C.sep;
  ctx.fillRect(rect.x + 1, rect.y + TITLE_H - 1, rect.w - 2, 1);

  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1.5;
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 14);
  ctx.stroke();

  [C.pink, C.yellow, C.green].forEach((c, i) => {
    ctx.beginPath();
    ctx.fillStyle = c;
    ctx.arc(rect.x + 26 + i * 24, rect.y + TITLE_H / 2, 6.5, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = C.dim;
  ctx.font = `500 ${Math.round(TITLE_H * 0.38)}px ${MONO}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(title, rect.x + rect.w / 2, rect.y + TITLE_H / 2 + 1);
  ctx.textAlign = 'left';

  return { x: rect.x + PAD, y: rect.y + TITLE_H + PAD, w: rect.w - PAD * 2, h: rect.h - TITLE_H - PAD * 2 };
}

// ── Code panel ────────────────────────────────────────────────────────────────────
function drawCodePanel(ctx: CanvasRenderingContext2D, prep: Prepared, idx: number, rect: Rect, time: number): { runBtn: Rect } {
  const dsl = prep.dsl;
  const scene = dsl.scenes[idx] as CodeScene;
  const body = drawChrome(ctx, rect, scene.title || langLabel(scene.language));

  const fs = codeFont(scene, dsl);
  const lh = lineH(fs);
  ctx.font = `${fs}px ${MONO}`;
  ctx.textBaseline = 'alphabetic';
  const charW = ctx.measureText('M').width;
  const gutterW = fs * 2.2;
  const baseY = body.y + fs;

  const lines = prep.code.get(idx) || [];
  const sched = prep.schedule.get(idx) || [];
  const total = scene.code.length;
  const local = time - scene.startTime;
  const shown = revealedCount(sched, local); // human timing: pauses after each line
  const done = shown >= total;

  ctx.save();
  roundRect(ctx, rect.x, rect.y + TITLE_H, rect.w, rect.h - TITLE_H, 14);
  ctx.clip();

  // line-number gutter
  ctx.font = `${Math.round(fs * 0.7)}px ${MONO}`;
  for (let li = 0; li < lines.length; li++) {
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillText(String(li + 1).padStart(2, ' '), body.x, baseY + li * lh);
  }
  ctx.font = `${fs}px ${MONO}`;

  const prefix: number[] = [];
  let acc = 0;
  for (let li = 0; li < lines.length; li++) { prefix[li] = acc; acc += lines[li].length + 1; }

  let headX = body.x + gutterW;
  let headY = baseY;

  for (let li = 0; li < lines.length; li++) {
    const y = baseY + li * lh;
    const cells = lines[li];
    for (let c = 0; c < cells.length; c++) {
      const g = prefix[li] + c;
      const age = local - (sched[g] ?? Infinity);
      if (age <= 0) continue;
      const cell = cells[c];
      if (cell.ch !== ' ') {
        ctx.globalAlpha = clamp(age / CHAR_FADE, 0, 1); // clean fade, no motion/glow
        ctx.fillStyle = cell.color;
        ctx.fillText(cell.ch, body.x + gutterW + c * charW, y);
        ctx.globalAlpha = 1;
      }
    }
    if (shown >= prefix[li] && shown <= prefix[li] + cells.length) {
      headX = body.x + gutterW + (shown - prefix[li]) * charW;
      headY = y;
    }
  }
  ctx.restore();

  // clean caret: solid while typing, gentle blink once done
  if (scene.cursorVisible !== false) {
    const vis = done ? (Math.floor(time * 1.8) % 2 === 0 ? 1 : 0) : 1;
    if (vis) {
      ctx.fillStyle = C.cyan;
      ctx.fillRect(headX + 1, headY - fs + 2, 2.5, fs + 2);
    }
  }

  const btnW = 92, btnH = 30;
  return { runBtn: { x: rect.x + rect.w - btnW - 16, y: rect.y + (TITLE_H - btnH) / 2, w: btnW, h: btnH } };
}

// ── Run button + minimal click feedback ───────────────────────────────────────────
function drawRunButton(ctx: CanvasRenderingContext2D, b: Rect, press: number) {
  const active = press >= 0;
  ctx.save();
  const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
  if (active) { grad.addColorStop(0, '#34d399'); grad.addColorStop(1, '#10b981'); }
  else { grad.addColorStop(0, 'rgba(52,211,153,0.20)'); grad.addColorStop(1, 'rgba(16,185,129,0.12)'); }
  ctx.fillStyle = grad;
  roundRect(ctx, b.x, b.y, b.w, b.h, 8);
  ctx.fill();
  ctx.strokeStyle = active ? '#6ee7b7' : 'rgba(52,211,153,0.45)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, b.x, b.y, b.w, b.h, 8);
  ctx.stroke();
  ctx.fillStyle = active ? '#052e1a' : C.green;
  ctx.font = `600 ${Math.round(b.h * 0.42)}px ${MONO}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText('Run', b.x + b.w / 2 + 6, b.y + b.h / 2 + 1);
  const ty = b.y + b.h / 2, tx = b.x + 20;
  ctx.beginPath();
  ctx.moveTo(tx, ty - 6); ctx.lineTo(tx + 10, ty); ctx.lineTo(tx, ty + 6); ctx.closePath();
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.restore();
}

function drawClickFx(ctx: CanvasRenderingContext2D, b: Rect, time: number, start: number) {
  // one soft ring — clean feedback, nothing more
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const t = clamp((time - start) / 0.45, 0, 1);
  ctx.save();
  ctx.strokeStyle = `rgba(110,231,183,${(1 - t) * 0.6})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 6 + t * 40, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ── Terminal panel ─────────────────────────────────────────────────────────────────
function drawTerminalPanel(ctx: CanvasRenderingContext2D, scene: TerminalScene, rect: Rect, time: number, dsl: AnimationDSL) {
  const body = drawChrome(ctx, rect, 'bash — output');
  const fs = scene.fontSize || Math.round(dsl.height / 38);
  const lh = lineH(fs);
  ctx.font = `${fs}px ${MONO}`;
  ctx.textBaseline = 'alphabetic';
  const charW = ctx.measureText('M').width;
  const baseY = body.y + fs;

  ctx.save();
  roundRect(ctx, rect.x, rect.y + TITLE_H, rect.w, rect.h - TITLE_H, 14);
  ctx.clip();

  ctx.fillStyle = C.prompt;
  ctx.fillText((scene.prompt || '$ ') + (scene.command || ''), body.x, baseY);

  const total = scene.output.length;
  const local = time - scene.startTime;
  const sched = typeSchedule(scene.output, scene.typingSpeed);
  const shown = revealedCount(sched, local);
  const done = shown >= total;

  let li = 0, col = 0;
  let headX = body.x, headY = baseY + lh;
  for (let i = 0; i < scene.output.length; i++) {
    const ch = scene.output[i];
    if (ch === '\n') { li++; col = 0; continue; }
    const age = local - sched[i];
    if (age > 0) {
      const x = body.x + col * charW;
      const y = baseY + lh * (li + 1);
      if (ch !== ' ') {
        ctx.globalAlpha = clamp(age / CHAR_FADE, 0, 1);
        ctx.fillStyle = C.terminal;
        ctx.fillText(ch, x, y);
        ctx.globalAlpha = 1;
      }
      headX = x + charW; headY = y;
    }
    col++;
  }
  ctx.restore();

  const blink = Math.floor(time * 1.8) % 2 === 0;
  if (!done || blink) {
    ctx.fillStyle = C.terminal;
    ctx.globalAlpha = done ? 0.6 : 1;
    ctx.fillRect(headX + 2, headY - fs + 2, charW * 0.55, fs);
    ctx.globalAlpha = 1;
  }
}

// ── Highlight overlay ─────────────────────────────────────────────────────────────
function drawHighlight(ctx: CanvasRenderingContext2D, scene: { startLine: number; endLine: number; color?: string; startTime: number; duration: number }, codeRect: Rect, code: CodeScene, dsl: AnimationDSL, time: number) {
  const fs = codeFont(code, dsl);
  const lh = lineH(fs);
  const bodyY = codeRect.y + TITLE_H + PAD;
  const y = bodyY + (scene.startLine - 1) * lh - fs;
  const h = (scene.endLine - scene.startLine + 1) * lh;
  const p = easeOutCubic(clamp((time - scene.startTime) / 0.35, 0, 1));
  ctx.save();
  ctx.globalAlpha = p;
  ctx.fillStyle = scene.color || 'rgba(255,123,156,0.10)';
  ctx.fillRect(codeRect.x + 6, y, codeRect.w - 12, h);
  ctx.fillStyle = C.pink;
  ctx.fillRect(codeRect.x + 6, y, 3, h);
  ctx.restore();
}

// ── Caption (clean fade) ────────────────────────────────────────────────────────
function drawCaption(ctx: CanvasRenderingContext2D, scene: TextScene, time: number, W: number, H: number) {
  const el = time - scene.startTime;
  const fin = scene.fadeIn || 0;
  const fout = scene.fadeOut || 0;
  let a = 1;
  if (fin > 0 && el < fin) a = easeInOut(el / fin);
  else if (fout > 0 && el > scene.duration - fout) a = easeInOut((scene.duration - el) / fout);
  a = clamp(a, 0, 1);
  if (a <= 0) return;

  const fs = scene.fontSize || Math.round(H / 27);
  ctx.font = `500 ${fs}px ${MONO}`;
  const textW = ctx.measureText(scene.content).width;
  const padX = 32, padY = 16;
  const boxW = textW + padX * 2, boxH = fs + padY * 2;

  let cy: number;
  switch (scene.position) {
    case 'top': cy = 130; break;
    case 'top-center': cy = H * 0.28; break;
    case 'center': cy = H / 2; break;
    default: cy = H - 150;
  }
  const x0 = W / 2 - boxW / 2;
  const y0 = cy - boxH / 2;

  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(0, (1 - a) * 8);
  ctx.fillStyle = 'rgba(15,15,19,0.85)';
  roundRect(ctx, x0, y0, boxW, boxH, 11);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  roundRect(ctx, x0, y0, boxW, boxH, 11);
  ctx.stroke();
  ctx.fillStyle = scene.color || C.text;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(scene.content, W / 2, cy + 1);
  ctx.textAlign = 'left';
  ctx.restore();
}

function langLabel(lang: string): string {
  const map: Record<string, string> = {
    python: 'main.py', py: 'main.py', javascript: 'index.js', js: 'index.js',
    typescript: 'index.ts', ts: 'index.ts', tsx: 'app.tsx', jsx: 'app.jsx',
    bash: 'script.sh', sh: 'script.sh', go: 'main.go', rust: 'main.rs',
    java: 'Main.java', cpp: 'main.cpp', c: 'main.c', html: 'index.html',
    css: 'style.css', json: 'data.json', sql: 'query.sql',
  };
  return map[lang.toLowerCase()] || lang;
}
