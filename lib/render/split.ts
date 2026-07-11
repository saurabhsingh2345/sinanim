// Split template: editor (typed code, reuses Prepared.ideTokens) + live
// browser preview side by side. splitTypedCount/CharAt feed the Conductor.
import { SplitScene } from '../types';
import { clamp, easeOutCubic } from '../utils';
import { typedRevealIndex, commonPrefixLen } from '../timing';
import type { Prepared } from '../renderer';
import {
  C, IDE, MONO, Rect,
  cardAlpha, drawWindowFrame, drawTemplateCaption, plainTokens, revealTokenLines,
} from './shared';
import { pageThemeFrom, drawBrowserChrome, drawPageBlocks } from './browser';

export function splitStepTimes(scene: SplitScene): number[] {
  const window = Math.min(scene.narrationDuration ?? scene.duration, scene.duration);
  const usable = Math.max(window - 0.5, 0.6);
  const weight = (st: SplitScene['steps'][number]) => st.weight ?? 1;
  const sum = scene.steps.reduce((a, s) => a + weight(s), 0) || 1;
  let t = 0.2;
  return scene.steps.map((s) => { const at = t; t += (weight(s) / sum) * usable; return at; });
}

export function splitTypedCount(scene: SplitScene, time: number): number {
  const local = time - scene.startTime;
  const times = splitStepTimes(scene);
  let k = -1; for (let i = 0; i < times.length; i++) if (local >= times[i] - 1e-6) k = i;
  if (k < 0) return 0;
  const endK = k + 1 < times.length ? times[k + 1] : Math.min(scene.narrationDuration ?? scene.duration, scene.duration);
  const stepDur = Math.max(endK - times[k], 0.001);
  const stepLocal = local - times[k];
  let count = 0;
  for (let j = 0; j <= k; j++) {
    const full = scene.steps[j]?.code || '';
    const prev = j > 0 ? scene.steps[j - 1].code : '';
    const cp = commonPrefixLen(prev, full);
    const reveal = j < k
      ? full.length
      : typedRevealIndex(prev, full, stepLocal, stepDur, 42);
    count += Math.max(0, reveal - cp);
  }
  return count;
}

export function splitTypedCharAt(scene: SplitScene, time: number): string {
  const local = time - scene.startTime;
  const times = splitStepTimes(scene);
  let k = -1; for (let i = 0; i < times.length; i++) if (local >= times[i] - 1e-6) k = i;
  if (k < 0) return '';
  const endK = k + 1 < times.length ? times[k + 1] : Math.min(scene.narrationDuration ?? scene.duration, scene.duration);
  const full = scene.steps[k]?.code || '';
  const prev = k > 0 ? scene.steps[k - 1].code : '';
  const reveal = typedRevealIndex(prev, full, local - times[k], Math.max(endK - times[k], 0.001), 42);
  if (reveal <= 0) return '';
  return full[reveal - 1] || '';
}

export function drawSplitCard(ctx: CanvasRenderingContext2D, prep: Prepared, scene: SplitScene, time: number, W: number, H: number) {
  const a = cardAlpha(scene, time); if (a <= 0) return;
  const idx = prep.dsl.scenes.indexOf(scene);
  const th = pageThemeFrom(scene);
  const local = time - scene.startTime;
  ctx.save(); ctx.globalAlpha = a;
  const M = Math.round(W * 0.04);
  const win: Rect = { x: M, y: Math.round(H * 0.06), w: W - 2 * M, h: H - Math.round(H * 0.15) };
  const gap = 18;
  const leftW = Math.round(win.w * 0.5) - gap / 2;
  const times = splitStepTimes(scene);
  let k = -1; for (let i = 0; i < times.length; i++) if (local >= times[i] - 1e-6) k = i;
  if (k < 0) k = 0;
  const endK = k + 1 < times.length ? times[k + 1] : Math.min(scene.narrationDuration ?? scene.duration, scene.duration);
  const rawP = clamp((local - times[k]) / Math.max(endK - times[k], 0.001), 0, 1);
  const step = scene.steps[k] || scene.steps[scene.steps.length - 1];
  const prevCode = k > 0 ? scene.steps[k - 1].code : '';

  // left: editor
  const lWin: Rect = { x: win.x, y: win.y, w: leftW, h: win.h };
  const TH = 40;
  drawWindowFrame(ctx, lWin, scene.filename || `index.${scene.language}`, '#181820', IDE.bg, TH);
  const full = step?.code || '';
  const reveal = typedRevealIndex(prevCode, full, (local - times[k]), Math.max(endK - times[k], 0.001), 42);
  const toks = prep.ideTokens.get(idx)?.get(`${scene.language}:::${full}`) || plainTokens(full);
  const shownLines = revealTokenLines(toks, reveal);
  const fs = Math.round(H / 42), lh = Math.round(fs * 1.55);
  ctx.font = `${fs}px ${MONO}`; ctx.textBaseline = 'alphabetic';
  const charW = ctx.measureText('M').width;
  ctx.save(); ctx.beginPath(); ctx.rect(lWin.x, lWin.y + TH, lWin.w, lWin.h - TH); ctx.clip();
  const gutterW = Math.round(charW * 3.4);
  const maxRows = Math.max(1, Math.floor((lWin.h - TH - 16) / lh));
  const scroll = Math.max(0, shownLines.length - maxRows);
  for (let r = 0; r < maxRows; r++) {
    const li = r + scroll; if (li >= shownLines.length) break;
    const y = lWin.y + TH + 12 + fs + r * lh;
    ctx.fillStyle = IDE.dim; ctx.textAlign = 'right'; ctx.fillText(String(li + 1), lWin.x + gutterW - 6, y); ctx.textAlign = 'left';
    let x = lWin.x + gutterW + 10;
    for (const t of shownLines[li]) { ctx.fillStyle = t.color; ctx.fillText(t.text, x, y); x += t.text.length * charW; }
    if (li === shownLines.length - 1 && reveal < full.length) { ctx.fillStyle = C.accent; ctx.fillRect(x + 1, y - fs, charW * 0.5, fs + 3); }
  }
  ctx.restore(); ctx.restore(); // code clip + window frame clip

  // right: live preview (browser)
  const rWin: Rect = { x: win.x + leftW + gap, y: win.y, w: win.w - leftW - gap, h: win.h };
  const { pageTop } = drawBrowserChrome(ctx, rWin, scene.url || 'localhost:3000', scene.url || 'preview', th, 1);
  const pageRect: Rect = { x: rWin.x, y: pageTop, w: rWin.w, h: rWin.y + rWin.h - pageTop };
  const blocks = step?.blocks || [];
  drawPageBlocks(ctx, blocks, pageRect, blocks.length, easeOutCubic(clamp(rawP * 1.5, 0, 1)), th, Math.round(H / 50));
  ctx.restore(); // browser frame clip
  // caption
  if (step?.caption) { ctx.save(); ctx.globalAlpha = a; drawTemplateCaption(ctx, step.caption, win, H); ctx.restore(); }
  ctx.restore(); // alpha
}
