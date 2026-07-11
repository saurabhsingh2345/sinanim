// CLI template: full-frame terminal session card (narration-weighted command
// pacing, ANSI-colored recorded output) plus the compact pane used by the
// layout scene. cliTypedCount feeds the Conductor's keystroke SFX.
import { CliScene } from '../types';
import { clamp } from '../utils';
import { ansiToLines, hasAnsi } from '../ansi';
import {
  ACTIVE_PACK, C, IDE, MONO, Rect,
  roundRect, cardAlpha, drawWindowFrame, termLineColor,
} from './shared';

export function cliStepTimes(scene: CliScene): number[] {
  const window = Math.min(scene.narrationDuration ?? scene.duration, scene.duration);
  const usable = Math.max(window - 0.5, 0.6);
  const weight = (c: CliCommandLike) => c.weight ?? (0.8 + (c.output?.length || 0) / 45);
  const sum = scene.commands.reduce((a, c) => a + weight(c), 0) || 1;
  let t = 0.2;
  return scene.commands.map((c) => { const at = t; t += (weight(c) / sum) * usable; return at; });
}
type CliCommandLike = CliScene['commands'][number];

export function cliTypedCount(scene: CliScene, time: number): number {
  const local = time - scene.startTime;
  const times = cliStepTimes(scene);
  let k = -1; for (let i = 0; i < times.length; i++) if (local >= times[i] - 1e-6) k = i;
  const endK = k + 1 < times.length ? times[k + 1] : Math.min(scene.narrationDuration ?? scene.duration, scene.duration);
  const rawP = k >= 0 ? clamp((local - times[k]) / Math.max(endK - times[k], 0.001), 0, 1) : 0;
  let count = 0;
  for (let j = 0; j <= k; j++) {
    const c = scene.commands[j]; if (!c) break;
    const cmdP = j < k ? 1 : clamp(rawP / 0.3, 0, 1);
    count += Math.round(c.command.length * cmdP);
  }
  return Math.floor(count / 2);
}

export function drawCliCard(ctx: CanvasRenderingContext2D, scene: CliScene, time: number, W: number, H: number) {
  const a = cardAlpha(scene, time); if (a <= 0) return;
  const local = time - scene.startTime;
  const cli = ACTIVE_PACK.cli;
  const panel = ACTIVE_PACK.panel;
  ctx.save(); ctx.globalAlpha = a;
  const M = Math.round(W * 0.08);
  const win: Rect = { x: M, y: Math.round(H * 0.09), w: W - 2 * M, h: H - Math.round(H * 0.22) };
  const TH = 44;
  drawWindowFrame(ctx, win, scene.title || `zsh — ${scene.cwd || '~'}`, panel.panelTop, cli.bg || panel.panel, TH);

  const times = cliStepTimes(scene);
  let k = -1; for (let i = 0; i < times.length; i++) if (local >= times[i] - 1e-6) k = i;
  const endK = k + 1 < times.length ? times[k + 1] : Math.min(scene.narrationDuration ?? scene.duration, scene.duration);
  const rawP = k >= 0 ? clamp((local - times[k]) / Math.max(endK - times[k], 0.001), 0, 1) : 0;

  const fs = Math.round(H / 40), lh = Math.round(fs * 1.5);
  ctx.font = `${fs}px ${MONO}`; ctx.textBaseline = 'alphabetic';
  const cw = ctx.measureText('M').width;
  const bX = win.x + 30, bY = win.y + TH + 10;
  type Seg = { text: string; color: string };
  const rows: Seg[][] = [];
  let streaming = false;
  for (let j = 0; j <= k; j++) {
    const c = scene.commands[j]; if (!c) break;
    const done = j < k;
    const cmdP = done ? 1 : clamp(rawP / 0.3, 0, 1);
    const outP = done ? 1 : clamp((rawP - 0.3) / 0.6, 0, 1);
    rows.push([{ text: `${scene.cwd || '~'}`, color: cli.cwd || IDE.termCyan }, { text: ' ❯ ', color: cli.prompt || IDE.termGreen }, { text: c.command.slice(0, Math.ceil(c.command.length * cmdP)), color: panel.text }]);
    const outRaw = c.output || '';
    if (outRaw && hasAnsi(outRaw)) {
      // recorded output: honor its real ANSI colors, revealing by plain chars
      const lines = ansiToLines(outRaw);
      const totalChars = lines.reduce((a, l) => a + l.reduce((b, sg) => b + sg.text.length, 0), 0);
      let budget = Math.ceil(totalChars * outP);
      for (const line of lines) {
        if (budget <= 0 && outP < 1) break;
        const segs: Seg[] = [];
        for (const sg of line) {
          const t = outP < 1 ? sg.text.slice(0, Math.max(0, budget)) : sg.text;
          budget -= sg.text.length;
          if (t) segs.push({ text: t, color: sg.color || cli.stdout || IDE.termOut });
        }
        rows.push(segs);
      }
    } else if (outRaw) {
      const out = outRaw.slice(0, Math.ceil(outRaw.length * outP));
      if (out) for (const ln of out.split('\n')) rows.push([{ text: ln, color: termLineColor(ln) || cli.stdout || IDE.termOut }]);
    }
    if (!done && c.output && cmdP >= 1 && outP < 1) streaming = true;
  }
  if (streaming) { const sp = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'; rows.push([{ text: sp[Math.floor(time * 12) % sp.length], color: cli.prompt || IDE.termGreen }]); }

  ctx.save();
  ctx.beginPath(); ctx.rect(win.x, win.y + TH, win.w, win.h - TH); ctx.clip();
  const maxRows = Math.max(1, Math.floor((win.h - TH - 20) / lh));
  const scroll = Math.max(0, rows.length - maxRows);
  for (let r = 0; r < maxRows; r++) {
    const ri = r + scroll; if (ri >= rows.length) break;
    const y = bY + fs + r * lh;
    let x = bX;
    for (const sg of rows[ri]) { ctx.fillStyle = sg.color; ctx.fillText(sg.text, x, y); x += sg.text.length * cw; }
    if (ri === rows.length - 1 && !streaming && Math.floor(time * 1.6) % 2 === 0) {
      ctx.fillStyle = panel.text; ctx.fillRect(x + 2, y - fs, cw * 0.55, fs);
    }
  }
  ctx.restore();
  ctx.restore(); // frame clip
  ctx.restore(); // alpha
}

export function drawCliPane(ctx: CanvasRenderingContext2D, scene: CliScene, time: number, pane: Rect, H: number) {
  ctx.fillStyle = ACTIVE_PACK.cli.bg;
  roundRect(ctx, pane.x, pane.y, pane.w, pane.h, 10);
  ctx.fill();
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1.5;
  roundRect(ctx, pane.x, pane.y, pane.w, pane.h, 10);
  ctx.stroke();
  const fs = Math.round(H / 48);
  const lh = Math.round(fs * 1.55);
  let y = pane.y + 28;
  const x = pane.x + 18;
  ctx.font = `500 ${fs}px ${MONO}`;
  ctx.textBaseline = 'top';
  const local = time - scene.startTime;
  const window = Math.min(scene.narrationDuration ?? scene.duration, scene.duration);
  const per = window / Math.max(scene.commands.length, 1);
  scene.commands.forEach((cmd, i) => {
    if (local < i * per) return;
    const typed = clamp((local - i * per) / Math.max(per * 0.35, 0.2), 0, 1);
    ctx.fillStyle = ACTIVE_PACK.cli.cwd;
    ctx.fillText(`${scene.cwd || '~'} `, x, y);
    const promptW = ctx.measureText(`${scene.cwd || '~'} `).width;
    ctx.fillStyle = ACTIVE_PACK.cli.prompt;
    ctx.fillText('$ ', x + promptW, y);
    const dollarW = ctx.measureText('$ ').width;
    ctx.fillStyle = C.text;
    const n = Math.ceil(cmd.command.length * typed);
    ctx.fillText(cmd.command.slice(0, n), x + promptW + dollarW, y);
    y += lh;
    if (typed >= 1 && cmd.output) {
      const outP = clamp((local - i * per - per * 0.4) / Math.max(per * 0.5, 0.2), 0, 1);
      const lines = cmd.output.split('\n');
      const show = Math.ceil(lines.length * outP);
      ctx.fillStyle = ACTIVE_PACK.cli.stdout;
      for (let li = 0; li < show && y < pane.y + pane.h - lh; li++) {
        ctx.fillText(lines[li], x, y);
        y += lh;
      }
    }
    y += 6;
  });
}
