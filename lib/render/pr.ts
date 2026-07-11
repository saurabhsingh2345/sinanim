// PR template: GitHub-style unified diff review card. Tokens for before+after
// are cached in Prepared.ideTokens (keyed `${lang}:::${code}`).
import { PrScene } from '../types';
import { Tok } from '../highlight';
import { clamp } from '../utils';
import { diffLines } from '../diff';
import type { Prepared } from '../renderer';
import {
  ACTIVE_PACK, MONO, Rect,
  cardAlpha, drawWindowFrame, fileColor, plainTokens,
} from './shared';

export function drawPrCard(ctx: CanvasRenderingContext2D, prep: Prepared, scene: PrScene, time: number, W: number, H: number) {
  const a = cardAlpha(scene, time); if (a <= 0) return;
  const idx = prep.dsl.scenes.indexOf(scene);
  const local = time - scene.startTime;
  const pack = ACTIVE_PACK;
  const GH = {
    bg: pack.ide.bg,
    head: pack.ide.title,
    border: pack.ide.line,
    text: pack.ide.text,
    dim: pack.ide.dim,
    addBg: 'rgba(46,160,67,0.15)',
    addG: 'rgba(46,160,67,0.28)',
    delBg: 'rgba(248,81,73,0.15)',
    delG: 'rgba(248,81,73,0.28)',
    green: '#3fb950',
    red: '#f85149',
  };
  ctx.save(); ctx.globalAlpha = a;
  const M = Math.round(W * 0.07);
  const win: Rect = { x: M, y: Math.round(H * 0.07), w: W - 2 * M, h: H - Math.round(H * 0.17) };
  drawWindowFrame(ctx, win, scene.title || `Pull request · ${scene.filename}`, GH.head, GH.bg, 44);

  const lines = diffLines(scene.before, scene.after);
  const adds = lines.filter((l) => l.kind === 'added').length;
  const dels = lines.filter((l) => l.kind === 'removed').length;

  // file sub-header with +N / −M
  const HH = 44, hy = win.y + 44;
  ctx.fillStyle = GH.head; ctx.fillRect(win.x, hy, win.w, HH);
  ctx.fillStyle = GH.border; ctx.fillRect(win.x, hy + HH, win.w, 1);
  ctx.font = `600 ${Math.round(H / 62)}px ${MONO}`; ctx.textBaseline = 'middle';
  ctx.beginPath(); ctx.fillStyle = fileColor(scene.filename); ctx.arc(win.x + 24, hy + HH / 2, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = GH.text; ctx.fillText(scene.filename, win.x + 40, hy + HH / 2 + 1);
  ctx.textAlign = 'right';
  ctx.fillStyle = GH.green; ctx.fillText(`+${adds}`, win.x + win.w - 96, hy + HH / 2 + 1);
  ctx.fillStyle = GH.red; ctx.fillText(`−${dels}`, win.x + win.w - 28, hy + HH / 2 + 1);
  ctx.textAlign = 'left';

  const bodyY = hy + HH + 1;
  const lang = scene.language || 'text';
  const beforeToks = prep.ideTokens.get(idx)?.get(`${lang}:::${scene.before}`) || plainTokens(scene.before);
  const afterToks = prep.ideTokens.get(idx)?.get(`${lang}:::${scene.after}`) || plainTokens(scene.after);
  const fs = Math.round(H / 46), lh = Math.round(fs * 1.6);
  ctx.font = `${fs}px ${MONO}`; ctx.textBaseline = 'alphabetic';
  const charW = ctx.measureText('M').width;
  const gutW = Math.round(charW * 8);
  const window = Math.min(scene.narrationDuration ?? scene.duration, scene.duration);
  const reveal = clamp((local - 0.3) / Math.max(window - 0.8, 0.5), 0, 1);
  const shownRows = Math.max(1, Math.ceil(lines.length * reveal));
  const maxRows = Math.max(1, Math.floor((win.y + win.h - bodyY - 8) / lh));
  const scroll = Math.max(0, shownRows - maxRows);

  ctx.save();
  ctx.beginPath(); ctx.rect(win.x, bodyY, win.w, win.y + win.h - bodyY); ctx.clip();
  let ai = 0, bi = 0, oldNo = 1, newNo = 1;
  for (let li = 0; li < lines.length && li < shownRows; li++) {
    const dl = lines[li];
    let toks: Tok[]; let oldLabel = '', newLabel = '';
    if (dl.kind === 'removed') { toks = beforeToks[ai] || [{ text: dl.text, color: GH.text }]; oldLabel = String(oldNo++); ai++; }
    else if (dl.kind === 'added') { toks = afterToks[bi] || [{ text: dl.text, color: GH.text }]; newLabel = String(newNo++); bi++; }
    else { toks = afterToks[bi] || [{ text: dl.text, color: GH.text }]; oldLabel = String(oldNo++); newLabel = String(newNo++); ai++; bi++; }
    const rIndex = li - scroll; if (rIndex < 0) continue;
    const rowTop = bodyY + rIndex * lh;
    if (rowTop > win.y + win.h) break;
    const y = rowTop + fs + 5;
    if (dl.kind === 'added') { ctx.fillStyle = GH.addBg; ctx.fillRect(win.x, rowTop, win.w, lh); ctx.fillStyle = GH.addG; ctx.fillRect(win.x, rowTop, gutW, lh); }
    else if (dl.kind === 'removed') { ctx.fillStyle = GH.delBg; ctx.fillRect(win.x, rowTop, win.w, lh); ctx.fillStyle = GH.delG; ctx.fillRect(win.x, rowTop, gutW, lh); }
    ctx.font = `${fs}px ${MONO}`; ctx.fillStyle = GH.dim; ctx.textAlign = 'right';
    ctx.fillText(oldLabel, win.x + charW * 3, y); ctx.fillText(newLabel, win.x + charW * 6.5, y); ctx.textAlign = 'left';
    ctx.fillStyle = dl.kind === 'added' ? GH.green : dl.kind === 'removed' ? GH.red : GH.dim;
    ctx.fillText(dl.kind === 'added' ? '+' : dl.kind === 'removed' ? '−' : ' ', win.x + gutW - charW * 1.5, y);
    let x = win.x + gutW; for (const t of toks) { ctx.fillStyle = t.color; ctx.fillText(t.text, x, y); x += t.text.length * charW; }
  }
  ctx.restore();
  ctx.restore(); // frame clip
  ctx.restore(); // alpha
}
