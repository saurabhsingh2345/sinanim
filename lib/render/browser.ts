// Browser template: chromed window + declarative page blocks. drawPageBlocks /
// drawBrowserChrome / pageThemeFrom are shared by the split template and the
// layout scene's browser regions.
import { BrowserBlock, BrowserScene } from '../types';
import { clamp, easeOutCubic } from '../utils';
import { FocusTarget } from '../camera';
import {
  ACTIVE_PACK, MONO, SANS, Rect,
  roundRect, wrapText, withAlpha, cardAlpha, drawWindowFrame, drawMouseCursor,
} from './shared';

export interface PageTheme { bg: string; fg: string; dim: string; card: string; border: string; accent: string; }

export function pageThemeFrom(scene: { pageTheme?: 'light' | 'dark'; theme?: unknown }): PageTheme {
  const mode =
    scene.pageTheme === 'dark' || scene.theme === 'dark'
      ? 'dark'
      : 'light';
  return mode === 'dark' ? { ...ACTIVE_PACK.browserDark } : { ...ACTIVE_PACK.browserLight };
}

/** Draw page blocks top-down inside rect; reveal `shownCount` blocks, the last at `frac`. */
export function drawPageBlocks(ctx: CanvasRenderingContext2D, blocks: BrowserBlock[], rect: Rect, shownCount: number, frac: number, th: PageTheme, unit: number): Rect[] {
  ctx.save();
  ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
  ctx.fillStyle = th.bg; ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  const padX = unit * 1.4;
  let y = rect.y + unit * 0.6;
  const innerW = rect.w - padX * 2;
  const hitRects: Rect[] = [];
  for (let i = 0; i < blocks.length && i < shownCount; i++) {
    const b = blocks[i];
    const last = i === shownCount - 1;
    const p = last ? clamp(frac, 0, 1) : 1;
    if (p <= 0) break;
    ctx.save(); ctx.globalAlpha *= easeOutCubic(p); const rise = (1 - p) * 14; ctx.translate(0, rise);
    const x = rect.x + padX;
    const blockTop = y;
    if (b.kind === 'nav') {
      ctx.fillStyle = th.fg; ctx.font = `800 ${Math.round(unit * 1.05)}px ${MONO}`; ctx.textBaseline = 'middle';
      ctx.fillText(b.brand, x, y + unit);
      if (b.links) { ctx.font = `500 ${Math.round(unit * 0.62)}px ${MONO}`; ctx.fillStyle = th.dim; ctx.textAlign = 'right'; let lx = rect.x + rect.w - padX; for (let li = b.links.length - 1; li >= 0; li--) { ctx.fillText(b.links[li], lx, y + unit); lx -= ctx.measureText(b.links[li]).width + unit * 1.1; } ctx.textAlign = 'left'; }
      y += unit * 2.2; ctx.fillStyle = th.border; ctx.fillRect(x, y - unit * 0.6, innerW, 1);
      hitRects.push({ x, y: blockTop, w: innerW, h: y - blockTop });
    } else if (b.kind === 'hero') {
      ctx.fillStyle = th.fg; ctx.font = `800 ${Math.round(unit * 2)}px ${MONO}`; ctx.textBaseline = 'top';
      for (const ln of wrapText(ctx, b.heading, innerW)) { ctx.fillText(ln, x, y); y += unit * 2.3; }
      if (b.sub) { ctx.fillStyle = th.dim; ctx.font = `400 ${Math.round(unit * 0.85)}px ${MONO}`; for (const ln of wrapText(ctx, b.sub, innerW)) { ctx.fillText(ln, x, y); y += unit * 1.3; } }
      if (b.cta) {
        y += unit * 0.5; const bw = ctx.measureText(b.cta).width + unit * 2;
        ctx.fillStyle = th.accent; roundRect(ctx, x, y, bw, unit * 2, 8); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(unit * 0.8)}px ${MONO}`; ctx.textBaseline = 'middle'; ctx.fillText(b.cta, x + unit, y + unit);
        hitRects.push({ x, y, w: bw, h: unit * 2 });
        y += unit * 2.6;
      } else {
        hitRects.push({ x, y: blockTop, w: innerW, h: y - blockTop });
      }
      y += unit * 0.6;
    } else if (b.kind === 'button') {
      const bw = (ctx.font = `700 ${Math.round(unit * 0.8)}px ${MONO}`, ctx.measureText(b.label).width + unit * 2);
      ctx.fillStyle = b.primary ? th.accent : th.card; roundRect(ctx, x, y, bw, unit * 2, 8); ctx.fill();
      if (!b.primary) { ctx.strokeStyle = th.border; ctx.lineWidth = 1.5; roundRect(ctx, x, y, bw, unit * 2, 8); ctx.stroke(); }
      ctx.fillStyle = b.primary ? '#fff' : th.fg; ctx.textBaseline = 'middle'; ctx.fillText(b.label, x + unit, y + unit);
      hitRects.push({ x, y, w: bw, h: unit * 2 });
      y += unit * 2.8;
    } else if (b.kind === 'card') {
      const bh = unit * (b.body ? 4.2 : 2.6);
      ctx.fillStyle = th.card; roundRect(ctx, x, y, innerW, bh, 10); ctx.fill();
      ctx.strokeStyle = th.border; ctx.lineWidth = 1.5; roundRect(ctx, x, y, innerW, bh, 10); ctx.stroke();
      ctx.fillStyle = th.fg; ctx.font = `700 ${Math.round(unit * 0.95)}px ${MONO}`; ctx.textBaseline = 'top'; ctx.fillText(b.title, x + unit, y + unit * 0.8);
      if (b.body) { ctx.fillStyle = th.dim; ctx.font = `400 ${Math.round(unit * 0.72)}px ${MONO}`; let yy = y + unit * 2.2; for (const ln of wrapText(ctx, b.body, innerW - unit * 2).slice(0, 2)) { ctx.fillText(ln, x + unit, yy); yy += unit * 1.2; } }
      hitRects.push({ x, y, w: innerW, h: bh });
      y += bh + unit * 0.9;
    } else if (b.kind === 'text') {
      ctx.fillStyle = th.fg; ctx.font = `400 ${Math.round(unit * 0.82)}px ${MONO}`; ctx.textBaseline = 'top';
      const startY = y;
      for (const ln of wrapText(ctx, b.text, innerW)) { ctx.fillText(ln, x, y); y += unit * 1.3; } y += unit * 0.6;
      hitRects.push({ x, y: startY, w: innerW, h: y - startY });
    } else if (b.kind === 'input') {
      ctx.fillStyle = th.card; roundRect(ctx, x, y, innerW, unit * 2, 8); ctx.fill();
      ctx.strokeStyle = th.border; ctx.lineWidth = 1.5; roundRect(ctx, x, y, innerW, unit * 2, 8); ctx.stroke();
      ctx.fillStyle = b.value ? th.fg : th.dim; ctx.font = `400 ${Math.round(unit * 0.78)}px ${MONO}`; ctx.textBaseline = 'middle'; ctx.fillText(b.value || b.placeholder, x + unit, y + unit);
      hitRects.push({ x, y, w: innerW, h: unit * 2 });
      y += unit * 2.8;
    } else if (b.kind === 'image') {
      const bh = unit * 6; ctx.fillStyle = th.card; roundRect(ctx, x, y, innerW, bh, 10); ctx.fill();
      ctx.strokeStyle = th.border; ctx.lineWidth = 1.5; roundRect(ctx, x, y, innerW, bh, 10); ctx.stroke();
      ctx.fillStyle = th.dim; ctx.font = `400 ${Math.round(unit * 0.75)}px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(b.label || 'image', rect.x + rect.w / 2, y + bh / 2); ctx.textAlign = 'left';
      hitRects.push({ x, y, w: innerW, h: bh });
      y += bh + unit * 0.9;
    } else if (b.kind === 'code') {
      const lines = b.text.split('\n'); const bh = unit * (lines.length * 1.25 + 1);
      ctx.fillStyle = th.card; roundRect(ctx, x, y, innerW, bh, 8); ctx.fill();
      ctx.fillStyle = th.accent; ctx.font = `400 ${Math.round(unit * 0.72)}px ${MONO}`; ctx.textBaseline = 'top'; let yy = y + unit * 0.6; for (const ln of lines) { ctx.fillText(ln, x + unit, yy); yy += unit * 1.25; }
      hitRects.push({ x, y, w: innerW, h: bh });
      y += bh + unit * 0.9;
    } else if (b.kind === 'html') {
      const plain = String(b.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const lines = wrapText(ctx, plain.slice(0, 280), innerW);
      const bh = unit * (lines.length * 1.2 + 1.4);
      ctx.fillStyle = th.card; roundRect(ctx, x, y, innerW, bh, 8); ctx.fill();
      ctx.strokeStyle = th.border; ctx.lineWidth = 1; roundRect(ctx, x, y, innerW, bh, 8); ctx.stroke();
      ctx.fillStyle = th.fg; ctx.font = `400 ${Math.round(unit * 0.72)}px ${MONO}`; ctx.textBaseline = 'top';
      let yy = y + unit * 0.5;
      for (const ln of lines.slice(0, 8)) { ctx.fillText(ln, x + unit * 0.6, yy); yy += unit * 1.2; }
      hitRects.push({ x, y, w: innerW, h: bh });
      y += bh + unit * 0.9;
    } else if (b.kind === 'search') {
      // Google-like centered search box
      const q = b.query || '';
      const reveal = Math.ceil(q.length * (last ? p : 1));
      ctx.fillStyle = th.fg; ctx.font = `800 ${Math.round(unit * 1.8)}px ${MONO}`; ctx.textAlign = 'center';
      ctx.fillText(b.engine || 'Search', rect.x + rect.w / 2, y + unit);
      ctx.textAlign = 'left';
      y += unit * 2.4;
      const barH = unit * 2.2;
      ctx.fillStyle = th.card; roundRect(ctx, x, y, innerW, barH, barH / 2); ctx.fill();
      ctx.strokeStyle = th.border; ctx.lineWidth = 1.5; roundRect(ctx, x, y, innerW, barH, barH / 2); ctx.stroke();
      ctx.fillStyle = th.fg; ctx.font = `400 ${Math.round(unit * 0.85)}px ${MONO}`; ctx.textBaseline = 'middle';
      ctx.fillText(q.slice(0, reveal), x + unit * 1.2, y + barH / 2);
      hitRects.push({ x, y, w: innerW, h: barH });
      y += barH + unit * 1.2;
    } else if (b.kind === 'serp') {
      ctx.fillStyle = th.dim; ctx.font = `400 ${Math.round(unit * 0.65)}px ${MONO}`; ctx.textBaseline = 'top';
      ctx.fillText(`About ${b.results.length * 1240} results`, x, y); y += unit * 1.3;
      for (const r of b.results) {
        ctx.fillStyle = th.dim; ctx.font = `400 ${Math.round(unit * 0.58)}px ${MONO}`;
        ctx.fillText(r.url, x, y); y += unit * 0.85;
        ctx.fillStyle = '#8ab4f8'; ctx.font = `600 ${Math.round(unit * 0.95)}px ${MONO}`;
        ctx.fillText(r.title, x, y); y += unit * 1.15;
        ctx.fillStyle = th.fg; ctx.font = `400 ${Math.round(unit * 0.7)}px ${MONO}`;
        for (const ln of wrapText(ctx, r.snippet, innerW).slice(0, 2)) { ctx.fillText(ln, x, y); y += unit * 1.05; }
        y += unit * 0.55;
      }
      hitRects.push({ x, y: blockTop, w: innerW, h: y - blockTop });
    } else if (b.kind === 'docs') {
      const sideW = Math.round(innerW * 0.28);
      const sideH = unit * 9;
      ctx.fillStyle = th.card; roundRect(ctx, x, y, sideW, sideH, 8); ctx.fill();
      ctx.fillStyle = th.dim; ctx.font = `600 ${Math.round(unit * 0.6)}px ${MONO}`; ctx.textBaseline = 'top';
      let sy = y + unit * 0.6;
      ctx.fillText('Contents', x + unit * 0.5, sy); sy += unit * 1.1;
      for (const item of (b.sidebar || []).slice(0, 6)) {
        ctx.fillStyle = item === b.active ? th.accent : th.fg;
        ctx.font = `${item === b.active ? '700' : '400'} ${Math.round(unit * 0.68)}px ${MONO}`;
        ctx.fillText(item, x + unit * 0.5, sy); sy += unit * 1.15;
      }
      const cx = x + sideW + unit * 0.8;
      const cw = innerW - sideW - unit * 0.8;
      ctx.fillStyle = th.fg; ctx.font = `800 ${Math.round(unit * 1.35)}px ${MONO}`;
      ctx.fillText(b.heading, cx, y + unit * 0.4);
      let cy = y + unit * 2.2;
      ctx.fillStyle = th.fg; ctx.font = `400 ${Math.round(unit * 0.78)}px ${MONO}`;
      for (const ln of wrapText(ctx, b.body, cw).slice(0, 8)) { ctx.fillText(ln, cx, cy); cy += unit * 1.15; }
      if (b.highlight) {
        ctx.fillStyle = withAlpha(th.accent, 0.15);
        roundRect(ctx, cx - 4, cy + unit * 0.2, cw + 8, unit * 1.6, 6); ctx.fill();
        ctx.fillStyle = th.accent; ctx.font = `600 ${Math.round(unit * 0.75)}px ${MONO}`;
        ctx.fillText(b.highlight, cx, cy + unit * 0.55);
      }
      hitRects.push({ x, y, w: innerW, h: sideH });
      y += sideH + unit * 0.8;
    }
    ctx.restore();
  }
  ctx.restore();
  return hitRects;
}

export function drawBrowserChrome(
  ctx: CanvasRenderingContext2D,
  win: Rect,
  url: string,
  title: string,
  th: PageTheme,
  urlReveal = 1,
  tabs?: { title: string; active?: boolean }[],
): { pageTop: number; urlBar: Rect } {
  const TH = 40, TB = 44, toolH = 52;
  const chromeBg = th.bg === '#ffffff' || th.bg === '#f6f8fa' ? '#dee1e6' : '#202124';
  const tabInactive = th.bg === '#ffffff' || th.bg === '#f6f8fa' ? '#c7cad0' : '#35363a';
  drawWindowFrame(ctx, win, '', chromeBg, th.bg, TH);
  const tabY = win.y + TH;
  ctx.fillStyle = chromeBg; ctx.fillRect(win.x, tabY, win.w, TB);
  const tabList = tabs?.length ? tabs : [{ title, active: true }];
  let tx = win.x + 12;
  for (let i = 0; i < tabList.length; i++) {
    const t = tabList[i];
    const isOn = tabList.some((x) => x.active) ? !!t.active : i === 0;
    const tabW = Math.min(220, Math.max(120, win.w * 0.22));
    ctx.fillStyle = isOn ? th.bg : tabInactive;
    roundRect(ctx, tx, tabY + 8, tabW, TB - 8, 8); ctx.fill();
    ctx.beginPath(); ctx.fillStyle = th.accent; ctx.arc(tx + 16, tabY + TB / 2 + 3, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = th.fg; ctx.font = `500 ${Math.round(TB * 0.3)}px ${SANS}`; ctx.textBaseline = 'middle';
    const label = (t.title || 'New Tab').slice(0, 22);
    ctx.fillText(label, tx + 28, tabY + TB / 2 + 4);
    tx += tabW + 4;
  }
  // new tab affordance
  ctx.strokeStyle = th.dim; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(tx + 10, tabY + TB / 2 + 2); ctx.lineTo(tx + 22, tabY + TB / 2 + 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(tx + 16, tabY + TB / 2 - 4); ctx.lineTo(tx + 16, tabY + TB / 2 + 8); ctx.stroke();

  const toolY = tabY + TB;
  ctx.fillStyle = th.bg; ctx.fillRect(win.x, toolY, win.w, toolH);
  ctx.fillStyle = th.border; ctx.fillRect(win.x, toolY + toolH, win.w, 1);
  // back / forward / reload
  const midY = toolY + toolH / 2;
  ctx.strokeStyle = th.dim; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(win.x + 36, midY); ctx.lineTo(win.x + 24, midY - 7); ctx.moveTo(win.x + 36, midY); ctx.lineTo(win.x + 24, midY + 7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(win.x + 48, midY); ctx.lineTo(win.x + 60, midY - 7); ctx.moveTo(win.x + 48, midY); ctx.lineTo(win.x + 60, midY + 7); ctx.stroke();
  ctx.beginPath(); ctx.arc(win.x + 84, midY, 8, -0.2, Math.PI * 1.6); ctx.stroke();
  const barX = win.x + 110, barW = win.w - 170;
  const urlBar: Rect = { x: barX, y: toolY + 10, w: barW, h: toolH - 20 };
  ctx.fillStyle = th.card; roundRect(ctx, barX, toolY + 10, barW, toolH - 20, 16); ctx.fill();
  ctx.fillStyle = th.dim; ctx.font = `400 ${Math.round(toolH * 0.28)}px ${SANS}`; ctx.textBaseline = 'middle';
  ctx.fillText('🔒', barX + 14, midY + 1);
  ctx.fillStyle = th.fg; ctx.font = `400 ${Math.round(toolH * 0.3)}px ${MONO}`;
  ctx.fillText(url.slice(0, Math.ceil(url.length * urlReveal)), barX + 40, midY + 1);
  // profile bubble
  ctx.beginPath(); ctx.fillStyle = th.accent; ctx.arc(win.x + win.w - 28, midY, 12, 0, Math.PI * 2); ctx.fill();
  return { pageTop: toolY + toolH + 1, urlBar };
}

/** Cover-fit an image into a rect (crop overflow, center), clipped to the rect. */
function drawCoverImage(ctx: CanvasRenderingContext2D, img: CanvasImageSource, r: Rect) {
  const iw = (img as any).naturalWidth || (img as any).width || r.w;
  const ih = (img as any).naturalHeight || (img as any).height || r.h;
  const scale = Math.max(r.w / iw, r.h / ih);
  const dw = iw * scale, dh = ih * scale;
  const dx = r.x + (r.w - dw) / 2, dy = r.y; // top-align (show page from the top)
  ctx.save();
  ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

export function drawBrowserCard(ctx: CanvasRenderingContext2D, scene: BrowserScene, time: number, W: number, H: number, shot?: CanvasImageSource | null) {
  const a = cardAlpha(scene, time); if (a <= 0) return;
  const local = time - scene.startTime;
  const th = pageThemeFrom(scene);
  ctx.save(); ctx.globalAlpha = a;
  const M = Math.round(W * 0.06);
  const win: Rect = { x: M, y: Math.round(H * 0.055), w: W - 2 * M, h: H - Math.round(H * 0.14) };
  const urlReveal = clamp(local / 0.8, 0, 1);
  const tabs = scene.tabs?.map((t) => ({ title: t.title, active: t.active })) ||
    [{ title: scene.title || scene.url.replace(/^https?:\/\//, ''), active: true }];
  const { pageTop, urlBar } = drawBrowserChrome(ctx, win, scene.url, tabs[0]?.title || 'Tab', th, urlReveal, tabs);
  const window = Math.min(scene.narrationDuration ?? scene.duration, scene.duration);
  const start = 0.8, per = Math.max((window - start - 0.4) / Math.max(scene.blocks.length, 1), 0.4);
  const shown = clamp(Math.floor((local - start) / per) + 1, 0, scene.blocks.length);
  const frac = clamp(((local - start) / per) - (shown - 1), 0, 1);
  const pageRect: Rect = { x: win.x, y: pageTop, w: win.w, h: win.y + win.h - pageTop };
  const unit = Math.round(H / 44);
  // Real captured page screenshot, or the mock-block fallback.
  let hits: Rect[] = [];
  if (shot) {
    drawCoverImage(ctx, shot, pageRect);
  } else {
    hits = drawPageBlocks(ctx, scene.blocks, pageRect, shown, frac, th, unit);
  }
  // cursor click on the real block rect
  if (scene.clickBlock != null && !shot && local > window * 0.78) {
    const hit = hits[scene.clickBlock] || hits[hits.length - 1];
    const cxp = hit ? hit.x + hit.w / 2 : win.x + win.w * 0.5;
    const cyp = hit ? hit.y + hit.h / 2 : win.y + win.h * 0.6;
    const rp = clamp((local - window * 0.78) / 0.4, 0, 1);
    if (rp < 1) { ctx.beginPath(); ctx.strokeStyle = withAlpha(th.accent, 0.6 * (1 - rp)); ctx.lineWidth = 2; ctx.arc(cxp, cyp, 6 + rp * 22, 0, Math.PI * 2); ctx.stroke(); }
    drawMouseCursor(ctx, cxp, cyp, 1);
  }
  // early: zoom hint toward URL bar while typing address
  void urlBar;
  ctx.restore(); // frame clip
  ctx.restore(); // alpha
}

/** Camera focus for browser scenes — URL bar while typing, then CTA/click target. */
export function browserFocus(scene: BrowserScene, time: number, W: number, H: number): FocusTarget | null {
  const local = time - scene.startTime;
  const window = Math.min(scene.narrationDuration ?? scene.duration, scene.duration);
  const M = Math.round(W * 0.06);
  const win: Rect = { x: M, y: Math.round(H * 0.055), w: W - 2 * M, h: H - Math.round(H * 0.14) };
  const hasOmniboxType = scene.blocks.some((b) => b.kind === 'search') || local < 0.9;
  if (hasOmniboxType && local < Math.min(1.4, window * 0.25)) {
    return { x: win.x + win.w * 0.45, y: win.y + 40 + 44 + 26, zoom: 1.1, strength: 0.8 };
  }
  if (scene.clickBlock != null && local > window * 0.72) {
    // Aim toward mid-page CTA / SERP row (hit-test refined in drawBrowserCard)
    const yBias = scene.blocks[scene.clickBlock]?.kind === 'serp' ? 0.42 : 0.55;
    return { x: win.x + win.w * 0.4, y: win.y + win.h * yBias, zoom: 1.12, strength: 0.82 };
  }
  if (scene.blocks.some((b) => b.kind === 'docs' || b.kind === 'serp')) {
    return { x: win.x + win.w * 0.48, y: win.y + win.h * 0.48, zoom: 1.06, strength: 0.5 };
  }
  return { x: W / 2, y: H / 2, zoom: 1.03, strength: 0.32 };
}
