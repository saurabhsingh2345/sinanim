// API template: Postman-style request row → headers/body → streaming response.
import { ApiScene } from '../types';
import { clamp } from '../utils';
import {
  ACTIVE_PACK, MONO, Rect,
  roundRect, withAlpha, cardAlpha, drawWindowFrame,
} from './shared';

const METHOD_COLOR: Record<string, string> = { GET: '#61affe', POST: '#49cc90', PUT: '#fca130', DELETE: '#f93e3e', PATCH: '#50e3c2' };

export function drawApiCard(ctx: CanvasRenderingContext2D, scene: ApiScene, time: number, W: number, H: number) {
  const a = cardAlpha(scene, time); if (a <= 0) return;
  const local = time - scene.startTime;
  const th = ACTIVE_PACK.browserDark;
  ctx.save(); ctx.globalAlpha = a;
  const M = Math.round(W * 0.09);
  const win: Rect = { x: M, y: Math.round(H * 0.12), w: W - 2 * M, h: H - Math.round(H * 0.30) };
  const qs = scene.query && Object.keys(scene.query).length
    ? '?' + Object.entries(scene.query).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
    : '';
  const displayUrl = scene.url.includes('?') ? scene.url : `${scene.url}${qs}`;
  drawWindowFrame(ctx, win, `${scene.method} ${displayUrl}`, th.navBg || '#181b24', th.bg, 44);
  const unit = Math.round(H / 42);
  const pad = unit * 1.4;
  const x = win.x + pad; const innerW = win.w - pad * 2;
  let y = win.y + 44 + unit;

  // request row: method pill + url bar + Send
  const urlReveal = clamp(local / 1, 0, 1);
  const mc = METHOD_COLOR[scene.method] || th.accent;
  ctx.font = `800 ${Math.round(unit * 0.85)}px ${MONO}`; const mw = ctx.measureText(scene.method).width + unit * 1.4;
  ctx.fillStyle = mc; roundRect(ctx, x, y, mw, unit * 2, 8); ctx.fill();
  ctx.fillStyle = '#0f1117'; ctx.textBaseline = 'middle'; ctx.fillText(scene.method, x + unit * 0.7, y + unit + 1);
  const barX = x + mw + unit * 0.6, barW = innerW - mw - unit * 0.6 - unit * 6;
  ctx.fillStyle = th.card; roundRect(ctx, barX, y, barW, unit * 2, 8); ctx.fill();
  ctx.strokeStyle = th.border; ctx.lineWidth = 1.5; roundRect(ctx, barX, y, barW, unit * 2, 8); ctx.stroke();
  ctx.fillStyle = th.fg; ctx.font = `400 ${Math.round(unit * 0.78)}px ${MONO}`; ctx.fillText(displayUrl.slice(0, Math.ceil(displayUrl.length * urlReveal)), barX + unit * 0.7, y + unit + 1);
  const sendX = barX + barW + unit * 0.6, sendW = unit * 5;
  const sendPressed = local > 1.1 && local < 1.6;
  ctx.fillStyle = sendPressed ? withAlpha(th.accent, 0.7) : th.accent; roundRect(ctx, sendX, y, sendW, unit * 2, 8); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(unit * 0.8)}px ${MONO}`; ctx.textAlign = 'center'; ctx.fillText('Send', sendX + sendW / 2, y + unit + 1); ctx.textAlign = 'left';
  y += unit * 3;

  // optional headers
  if (scene.headers && Object.keys(scene.headers).length) {
    ctx.fillStyle = th.dim; ctx.font = `600 ${Math.round(unit * 0.6)}px ${MONO}`; ctx.textBaseline = 'top'; ctx.fillText('HEADERS', x, y); y += unit * 1.2;
    const entries = Object.entries(scene.headers);
    const hh = unit * (entries.length * 1.15 + 0.7);
    ctx.fillStyle = th.card; roundRect(ctx, x, y, innerW, hh, 8); ctx.fill();
    ctx.font = `400 ${Math.round(unit * 0.7)}px ${MONO}`; let yy = y + unit * 0.45;
    for (const [k, v] of entries) {
      ctx.fillStyle = th.accent; ctx.fillText(k, x + unit * 0.7, yy);
      ctx.fillStyle = th.fg; ctx.fillText(`: ${v}`, x + unit * 0.7 + ctx.measureText(k).width, yy);
      yy += unit * 1.15;
    }
    y += hh + unit * 0.7;
  }

  // optional request body
  if (scene.requestBody) {
    ctx.fillStyle = th.dim; ctx.font = `600 ${Math.round(unit * 0.6)}px ${MONO}`; ctx.textBaseline = 'top'; ctx.fillText('REQUEST BODY', x, y); y += unit * 1.2;
    const lines = scene.requestBody.split('\n'); const bh = unit * (lines.length * 1.2 + 0.8);
    ctx.fillStyle = th.card; roundRect(ctx, x, y, innerW, bh, 8); ctx.fill();
    ctx.fillStyle = th.fg; ctx.font = `400 ${Math.round(unit * 0.72)}px ${MONO}`; let yy = y + unit * 0.6; for (const ln of lines) { ctx.fillText(ln, x + unit * 0.8, yy); yy += unit * 1.2; } y += bh + unit;
  }

  // response (appears after send)
  const respIn = clamp((local - 1.6) / 0.4, 0, 1);
  if (respIn > 0) {
    ctx.save(); ctx.globalAlpha = a * respIn;
    ctx.fillStyle = th.dim; ctx.font = `600 ${Math.round(unit * 0.6)}px ${MONO}`; ctx.textBaseline = 'top'; ctx.fillText('RESPONSE', x, y);
    const ok = scene.status < 400; const sc = ok ? '#49cc90' : '#f93e3e';
    const label = `${scene.status} ${scene.statusText || (ok ? 'OK' : 'Error')}`;
    ctx.font = `700 ${Math.round(unit * 0.66)}px ${MONO}`; const pw = ctx.measureText(label).width + unit;
    ctx.fillStyle = withAlpha(sc, 0.18); roundRect(ctx, x + innerW - pw, y - unit * 0.2, pw, unit * 1.4, 6); ctx.fill();
    ctx.fillStyle = sc; ctx.textBaseline = 'middle'; ctx.fillText(label, x + innerW - pw + unit * 0.5, y + unit * 0.5);
    y += unit * 1.6;
    const bodyH = win.y + win.h - y - unit;
    ctx.fillStyle = th.card; roundRect(ctx, x, y, innerW, bodyH, 8); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, innerW, bodyH); ctx.clip();
    const rfs = Math.round(unit * 0.8), rlh = Math.round(rfs * 1.4);
    ctx.font = `${rfs}px ${MONO}`; ctx.textBaseline = 'top';
    const reveal = Math.ceil(scene.response.length * clamp((local - 1.8) / Math.max(scene.duration - 2.2, 0.5), 0, 1));
    const text = scene.response.slice(0, reveal);
    let yy = y + unit * 0.7; for (const ln of text.split('\n')) { ctx.fillStyle = th.fg; ctx.fillText(ln, x + unit, yy); yy += rlh; }
    ctx.restore();
    ctx.restore();
  }
  ctx.restore(); // frame clip
  ctx.restore(); // alpha
}
