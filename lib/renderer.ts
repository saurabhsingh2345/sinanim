import {
  AnimationDSL,
  ApiScene,
  BigStatScene,
  BrowserRecScene,
  BrowserScene,
  BulletsScene,
  CliScene,
  PrScene,
  SplitScene,
  ChallengeScene,
  ChapterScene,
  CodeScene,
  DiagramScene,
  DiffScene,
  IdeScene,
  LayoutScene,
  MascotScene,
  QuizScene,
  QuoteScene,
  SpriteScene,
  TerminalScene,
  TextScene,
  TitleScene,
  VizScene,
  VizStep,
  PRIMARY_CARD_TYPES,
} from './types';
import { tokenizeCode, Tok } from './highlight';
import { inferLang } from './dsl';
import { TEMPLATES, SpriteState } from './templates';
import { clamp, easeInOut, easeOutCubic, lerp } from './utils';
import { typeSchedule, revealedCount } from './timing';
import { FocusTarget, applyCamera, cameraAt } from './camera';
import { easeOutExpo, envelope, springOut, staggerProgress } from './motion';
import { MorphPlan, addRowAt, buildMorph, paceMorphToNarration } from './morph';
import { MascotAction, drawMascot } from './mascot';
import { resolveTheme, ThemePack } from './themes';
import {
  CaptionPage,
  WordTiming,
  buildCaptionPages,
  estimatedCaptionPages,
  findAnchorWord,
} from './word-timeline';
import { parseAnsi, stripAnsi } from './ansi';
import {
  C, IDE, ACTIVE_PACK, ACTIVE_BLOB_A, ACTIVE_BLOB_B, applyThemePack,
  MONO, CHAR_FADE, WIN_ANIM, TITLE_H, PAD, Rect,
  roundRect, sketchRoundRect, codeFont, lineH, withAlpha, wrapText,
  EASE, cardAlpha, fileColor, plainTokens, revealTokenLines,
  drawMouseCursor, termLineColor, drawWindowFrame, drawTemplateCaption, langLabel,
} from './render/shared';
import {
  pageThemeFrom, drawPageBlocks, drawBrowserChrome, drawBrowserCard, browserFocus,
} from './render/browser';
import { cliTypedCount, drawCliCard, drawCliPane } from './render/cli';
import { splitTypedCount, splitTypedCharAt, drawSplitCard } from './render/split';
import {
  ideStepTimes, ideTypedCount, ideTypedCharAt, ideFocus, drawIdeCard, drawIdePane,
} from './render/ide';
import { drawApiCard } from './render/api';
import { drawPrCard } from './render/pr';

export { browserFocus };
export { cliTypedCount };
export { splitTypedCount, splitTypedCharAt };
export { ideStepTimes, ideTypedCount, ideTypedCharAt, ideFocus };

// ── Prepared timeline ─────────────────────────────────────────────────────────
export interface Prepared {
  dsl: AnimationDSL;
  /** code/diff sceneIndex -> morph plan (a `code` scene morphs from empty). */
  morphs: Map<number, MorphPlan>;
  /** terminal sceneIndex -> per-character reveal times (human typing rhythm). */
  schedule: Map<number, number[]>;
  /** terminal sceneIndex -> the raw text behind that schedule. */
  typedText: Map<number, string>;
  /** ide sceneIndex -> tokenized code, keyed by `${lang}\0${code}`. */
  ideTokens: Map<number, Map<string, Tok[][]>>;
  /** sceneIndex -> word timings from the narration pipeline (scene-relative
   *  seconds). Attach after buildNarration; enables karaoke captions. */
  words?: Map<number, WordTiming[]>;
  /** Lazy per-scene karaoke caption pages (built on first draw). */
  captionPages?: Map<number, CaptionPage[]>;
  /** browserrec sceneIndex -> its <video> (browser only; Node draws a slate). */
  videos?: Map<number, HTMLVideoElement>;
}

/** Live UI state the interactive player feeds in (never set during export). */
export interface RenderUI {
  /** True in the live player: quizzes wait for an answer and NEVER auto-reveal
   *  on a timer (that timed reveal is export-only). */
  interactive?: boolean;
  quiz?: {
    /** Option the learner picked, or null while waiting. */
    selected: number | null;
    /** Set once answered: whether `selected` was right. */
    correct: boolean | null;
  };
  /** Wall-clock seconds since the current interaction began — drives overlay
   *  animation (the mascot) while the timeline itself is paused. */
  uiTime?: number;
}

export async function prepare(dsl: AnimationDSL): Promise<Prepared> {
  const morphs = new Map<number, MorphPlan>();
  const schedule = new Map<number, number[]>();
  const typedText = new Map<number, string>();
  const ideTokens = new Map<number, Map<string, Tok[][]>>();
  const videos = new Map<number, HTMLVideoElement>();
  await Promise.all(
    dsl.scenes.map(async (s, i) => {
      // Narration-paced content window: code should land WITH the voice, not
      // race ahead of it. When a scene has synthesized speech, its content
      // animation is stretched to occupy most of the speech window.
      const narrWindow = s.narrationDuration
        ? Math.min(s.narrationDuration, s.duration) * 0.88
        : 0;

      if (s.type === 'code') {
        const toks = await tokenizeCode(s.code, s.language);
        const plan = buildMorph('', s.code, [], toks);
        if (narrWindow) plan.timing = paceMorphToNarration(plan.timing, narrWindow);
        morphs.set(i, plan);
      } else if (s.type === 'terminal') {
        // schedule against the PLAIN text — recorded output may carry ANSI codes
        const plain = stripAnsi(s.output);
        let sched = typeSchedule(plain, s.typingSpeed);
        const natural = sched.length ? sched[sched.length - 1] : 0;
        if (narrWindow && natural > 0 && narrWindow > natural) {
          const factor = Math.min(narrWindow / natural, 3);
          sched = sched.map((t) => t * factor);
        }
        schedule.set(i, sched);
        typedText.set(i, plain);
      } else if (s.type === 'diff') {
        const [beforeToks, afterToks] = await Promise.all([
          tokenizeCode(s.before, s.language),
          tokenizeCode(s.after, s.language),
        ]);
        const plan = buildMorph(s.before, s.after, beforeToks, afterToks);
        if (narrWindow) plan.timing = paceMorphToNarration(plan.timing, narrWindow);
        morphs.set(i, plan);
      } else if (s.type === 'ide') {
        // Tokenize every distinct code snapshot the walkthrough will show.
        const lang = new Map<string, string>();
        for (const f of s.files) lang.set(f.path, f.language || inferLang(f.path));
        const langOf = (path: string) => lang.get(path) || inferLang(path);
        const m = new Map<string, Tok[][]>();
        const jobs: Promise<void>[] = [];
        const add = (code: string, l: string) => {
          const key = `${l}:::${code}`;
          if (!code || m.has(key)) return;
          m.set(key, []); // reserve, so duplicates don't double-schedule
          jobs.push(tokenizeCode(code, l).then((t) => { m.set(key, t); }));
        };
        for (const f of s.files) add(f.code || '', langOf(f.path));
        for (const st of s.steps)
          if (st.action.kind === 'type') add(st.action.code, langOf(st.action.file));
        await Promise.all(jobs);
        ideTokens.set(i, m);
      } else if (s.type === 'split') {
        const m = new Map<string, Tok[][]>();
        await Promise.all(s.steps.map(async (st) => {
          const key = `${s.language}:::${st.code}`;
          if (st.code && !m.has(key)) m.set(key, await tokenizeCode(st.code, s.language));
        }));
        ideTokens.set(i, m);
      } else if (s.type === 'pr') {
        const m = new Map<string, Tok[][]>();
        const lang = s.language || 'text';
        await Promise.all([s.before, s.after].map(async (code) => {
          const key = `${lang}:::${code}`;
          if (code && !m.has(key)) m.set(key, await tokenizeCode(code, lang));
        }));
        ideTokens.set(i, m);
      } else if (s.type === 'browserrec' && typeof window !== 'undefined' && s.src) {
        // load the capture clip; fail-soft to a slate if it never arrives
        const video = document.createElement('video');
        video.src = s.src;
        video.muted = true;
        video.preload = 'auto';
        video.playsInline = true;
        await Promise.race([
          new Promise<void>((res) => {
            video.addEventListener('loadeddata', () => res(), { once: true });
            video.addEventListener('error', () => res(), { once: true });
          }),
          new Promise<void>((res) => setTimeout(res, 5000)),
        ]);
        if (video.readyState >= 2) videos.set(i, video);
      }
    }),
  );
  return { dsl, morphs, schedule, typedText, ideTokens, videos };
}

/**
 * Seek every active browserrec clip to the exact frame for `time` and wait for
 * the decoder. The fast (WebCodecs) exporter awaits this before each
 * renderFrame so captures land frame-accurate in the file; the live player
 * skips it (renderFrame drift-corrects on its own, close enough for preview).
 */
export async function syncSceneVideos(prep: Prepared, time: number): Promise<void> {
  if (!prep.videos?.size) return;
  const jobs: Promise<void>[] = [];
  prep.videos.forEach((video, i) => {
    const s = prep.dsl.scenes[i];
    if (s.type !== 'browserrec') return;
    if (time < s.startTime || time >= s.startTime + s.duration) return;
    const local = Math.min(time - s.startTime + (s.clipStart ?? 0), Math.max(video.duration - 0.05, 0));
    if (Math.abs(video.currentTime - local) < 0.017) return;
    jobs.push(
      Promise.race([
        new Promise<void>((res) => {
          video.addEventListener('seeked', () => res(), { once: true });
          video.currentTime = local;
        }),
        new Promise<void>((res) => setTimeout(res, 250)),
      ]),
    );
  });
  await Promise.all(jobs);
}

function themeForMoment(dsl: AnimationDSL, card: AnimationDSL['scenes'][number] | null): ThemePack {
  const sceneTheme = card && 'theme' in card ? (card as any).theme : undefined;
  const sceneStyle = card && 'style' in card ? (card as any).style : undefined;
  // Browser/split may put light|dark in theme — treat those as pageTheme, not packs
  const packTheme =
    sceneTheme === 'light' || sceneTheme === 'dark' ? undefined : sceneTheme;
  return resolveTheme(dsl.theme as any, packTheme, dsl.brand, sceneStyle as any);
}
// ── Scene selection ───────────────────────────────────────────────────────────
const CARD_TYPES = PRIMARY_CARD_TYPES;

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
/** Active highlight overlay, honoring word anchors: a highlight that carries
 *  "syncWord" begins the moment that word is spoken in the narration of the
 *  code scene it overlays (temporal contiguity — the voice drives the visual). */
function activeHighlight(
  prep: Prepared,
  time: number,
  carrierIdx: number | null,
): { scene: { startLine: number; endLine: number; color?: string }; start: number; end: number } | null {
  const { dsl } = prep;
  let best: { scene: any; start: number; end: number } | null = null;
  for (const s of dsl.scenes) {
    if (s.type !== 'highlight') continue;
    let start = s.startTime;
    const anchor = (s as { syncWord?: string }).syncWord;
    if (anchor && carrierIdx != null && prep.words) {
      const words = prep.words.get(carrierIdx);
      const hit = words && findAnchorWord(words, anchor);
      if (hit) start = dsl.scenes[carrierIdx].startTime + hit.start;
    }
    const end = start + s.duration;
    if (time >= start - 1e-6 && time < end && (!best || start >= best.start)) {
      best = { scene: s as any, start, end };
    }
  }
  return best;
}

/** The full-frame card that owns this moment, if any. */
function activeCard(dsl: AnimationDSL, time: number) {
  let best: (typeof dsl.scenes)[number] | null = null;
  for (const s of dsl.scenes) {
    if (!CARD_TYPES.has(s.type)) continue;
    if (time >= s.startTime - 1e-6 && time < s.startTime + s.duration) {
      if (!best || s.startTime >= best.startTime) best = s;
    }
  }
  return best;
}

// ── Layout (pure — shared by drawing and the camera) ─────────────────────────
interface PanelSlot { kind: 'code' | 'terminal' | 'diff'; idx: number; rect: Rect; }

function layoutPanels(prep: Prepared, time: number): PanelSlot[] {
  const { dsl } = prep;
  const W = dsl.width, H = dsl.height;
  const contentW = Math.min(W - 220, 1380);
  const centerX = W / 2;

  const codeIdx = lastStartedIndex(dsl, 'code', time);
  const diffIdx = lastStartedIndex(dsl, 'diff', time);
  const termIdx = lastStartedIndex(dsl, 'terminal', time);
  const codeLike: { kind: 'code' | 'diff'; idx: number } | null =
    diffIdx >= 0 && (codeIdx < 0 || dsl.scenes[diffIdx].startTime >= dsl.scenes[codeIdx].startTime)
      ? { kind: 'diff', idx: diffIdx }
      : codeIdx >= 0
        ? { kind: 'code', idx: codeIdx }
        : null;

  const panels: { kind: 'code' | 'terminal' | 'diff'; idx: number; h: number }[] = [];
  if (codeLike) {
    const s = dsl.scenes[codeLike.idx] as CodeScene | DiffScene;
    const fs = codeFont(s, dsl);
    const plan = prep.morphs.get(codeLike.idx);
    // STABLE height — size for the tallest state so the panel never resizes (and
    // therefore never re-centers) mid-morph. A resizing panel is what read as jitter.
    const rows = plan ? Math.max(1, plan.beforeRows, plan.afterRows) : 1;
    panels.push({ kind: codeLike.kind, idx: codeLike.idx, h: TITLE_H + PAD * 2 + Math.min(rows, 18) * lineH(fs) });
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
  return panels.map((p) => {
    const rect: Rect = { x: centerX - contentW / 2, y, w: contentW, h: p.h };
    y += p.h + gap;
    return { kind: p.kind, idx: p.idx, rect };
  });
}

/** Frame rect of a highlight band inside the code panel (for drawing + camera).
 *  Must match the morph panel's row geometry exactly: text baseline for row r is
 *  at (bodyY + fs) + r*lh, so the line's box top is bodyY + r*lh. */
function highlightRect(scene: { startLine: number; endLine: number }, codeRect: Rect, code: CodeScene, dsl: AnimationDSL): Rect {
  const fs = codeFont(code, dsl);
  const lh = lineH(fs);
  const bodyY = codeRect.y + TITLE_H + PAD;
  const y = bodyY + (scene.startLine - 1) * lh;
  const h = (scene.endLine - scene.startLine + 1) * lh;
  return { x: codeRect.x + 6, y, w: codeRect.w - 12, h };
}

// ── Public entry ────────────────────────────────────────────────────────────────
export function renderFrame(ctx: CanvasRenderingContext2D, prep: Prepared, time: number, ui?: RenderUI) {
  const { dsl } = prep;
  const W = dsl.width;
  const H = dsl.height;

  const card = activeCard(dsl, time);
  applyThemePack(themeForMoment(dsl, card));

  drawBackdrop(ctx, dsl, time);

  // ── camera: breathe by default, push into cards, dive into highlights ──
  const targets: FocusTarget[] = [];
  const panels = layoutPanels(prep, time);
  const codeSlot = panels.find((p) => p.kind === 'code' || p.kind === 'diff') || null;

  if (card && card.type === 'ide') {
    // Screen-Studio-style: glide + zoom toward the region each step acts on.
    const f = ideFocus(card as IdeScene, time, W, H);
    if (f) targets.push(f);
  } else if (card && card.type === 'browser') {
    const f = browserFocus(card as BrowserScene, time, W, H);
    if (f) targets.push(f);
  } else if (card && card.type === 'layout') {
    const f = layoutFocus(card as LayoutScene, W, H);
    if (f) targets.push(f);
  } else if (card) {
    const p = clamp((time - card.startTime) / Math.max(card.duration, 0.01), 0, 1);
    targets.push({
      x: W / 2,
      y: H / 2,
      zoom: lerp(1.015, 1.06, p), // slow push-in across the card
      strength: envelope(time, card.startTime, card.startTime + card.duration, 0.5, 0.45),
    });
  } else {
    // dive toward the region of code that is changing right now
    const mf = codeSlot ? morphFocusTarget(prep, codeSlot, time) : null;
    if (mf) targets.push(mf);

    const hl = activeHighlight(prep, time, codeSlot?.idx ?? null);
    if (hl && codeSlot && codeSlot.kind === 'code') {
      const code = dsl.scenes[codeSlot.idx] as CodeScene;
      const r = highlightRect(hl.scene, codeSlot.rect, code, dsl);
      targets.push({
        x: clamp(r.x + r.w / 2, W * 0.3, W * 0.7),
        y: r.y + r.h / 2,
        zoom: 1.17,
        strength: envelope(time, hl.start, hl.end, 0.75, 0.6) * 0.92,
      });
    }
  }
  const cam = cameraAt(time, W, H, targets);

  ctx.save();
  applyCamera(ctx, cam, W, H);
  drawWorld(ctx, prep, time, panels, card, ui);
  drawCardTransition(ctx, card, time, W, H);
  ctx.restore();

  // fixed layer: captions, dip transitions, vignette
  const text = activeScene(dsl, 'text', time) as TextScene | null;
  if (text && !card) drawCaption(ctx, text, time, W, H);
  drawNarrationCaption(ctx, prep, time);
  drawDips(ctx, dsl, time, W, H);

  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.48, W / 2, H / 2, H * 0.98);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.32)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}

// ── Backdrop: layered, slowly-drifting color field ─────────────────────────────
function drawBackdrop(ctx: CanvasRenderingContext2D, dsl: AnimationDSL, time: number) {
  const W = dsl.width, H = dsl.height;
  ctx.fillStyle = ACTIVE_PACK.background || dsl.backgroundColor || '#0b0b10';
  ctx.fillRect(0, 0, W, H);

  // two soft color blobs, drifting almost imperceptibly
  const ax = W * (0.24 + 0.02 * Math.sin(time * 0.11));
  const ay = H * (0.08 + 0.02 * Math.cos(time * 0.09));
  const a = ctx.createRadialGradient(ax, ay, 0, ax, ay, W * 0.52);
  a.addColorStop(0, ACTIVE_BLOB_A);
  a.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, W, H);

  const bx = W * (0.84 + 0.02 * Math.cos(time * 0.08));
  const by = H * (0.86 + 0.02 * Math.sin(time * 0.1));
  const b = ctx.createRadialGradient(bx, by, 0, bx, by, W * 0.45);
  b.addColorStop(0, ACTIVE_BLOB_B);
  b.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = b;
  ctx.fillRect(0, 0, W, H);
}

/** Dip-to-black moments around chapter/title starts — reads as an edit cut. */
function drawDips(ctx: CanvasRenderingContext2D, dsl: AnimationDSL, time: number, W: number, H: number) {
  let a = 0;
  for (const s of dsl.scenes) {
    if (s.type !== 'chapter' && s.type !== 'title') continue;
    if (s.startTime < 0.2) continue; // opening card fades in on its own
    const d = Math.abs(time - s.startTime);
    if (d < 0.3) a = Math.max(a, easeInOut(1 - d / 0.3) * 0.85);
  }
  if (a > 0.01) {
    ctx.fillStyle = `rgba(5,5,8,${a})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// ── World (everything the camera sees) ─────────────────────────────────────────
function drawWorld(
  ctx: CanvasRenderingContext2D,
  prep: Prepared,
  time: number,
  panels: PanelSlot[],
  card: ReturnType<typeof activeCard>,
  ui?: RenderUI,
) {
  const { dsl } = prep;
  const W = dsl.width, H = dsl.height;

  // sprites render first, so panels and cards sit on top
  drawSprites(ctx, dsl, time);

  // an active card owns the whole frame
  if (card) {
    switch (card.type) {
      case 'title': drawTitleCard(ctx, card as TitleScene, time, W, H); return;
      case 'chapter': drawChapterCard(ctx, card as ChapterScene, time, W, H); return;
      case 'bullets': drawBulletsCard(ctx, card as BulletsScene, time, W, H); return;
      case 'diagram': drawDiagramCard(ctx, card as DiagramScene, time, W, H); return;
      case 'quote': drawQuoteCard(ctx, card as QuoteScene, time, W, H); return;
      case 'bigstat': drawBigStatCard(ctx, card as BigStatScene, time, W, H); return;
      case 'quiz': drawQuizCard(ctx, card as QuizScene, time, W, H, ui); return;
      case 'challenge': drawChallengeCard(ctx, card as ChallengeScene, time, W, H, ui); return;
      case 'viz': drawVizCard(ctx, card as VizScene, time, W, H); return;
      case 'ide': drawIdeCard(ctx, prep, card as IdeScene, time, W, H); return;
      case 'cli': drawCliCard(ctx, card as CliScene, time, W, H); return;
      case 'browser': drawBrowserCard(ctx, card as BrowserScene, time, W, H); return;
      case 'browserrec': drawBrowserRecCard(ctx, prep, card as BrowserRecScene, time, W, H); return;
      case 'split': drawSplitCard(ctx, prep, card as SplitScene, time, W, H); return;
      case 'api': drawApiCard(ctx, card as ApiScene, time, W, H); return;
      case 'pr': drawPrCard(ctx, prep, card as PrScene, time, W, H); return;
      case 'layout': drawLayoutCard(ctx, prep, card as LayoutScene, time, W, H); return;
    }
  }

  let codeRect: Rect | null = null;
  let codeScene: CodeScene | null = null;
  let runBtn: Rect | null = null;
  let codeSlot: PanelSlot | null = null;

  for (const p of panels) {
    const scene = dsl.scenes[p.idx];
    const age = time - scene.startTime;
    const enter = easeOutCubic(clamp(age / WIN_ANIM, 0, 1));

    ctx.save();
    ctx.globalAlpha = enter;
    ctx.translate(0, (1 - enter) * 22);

    if (p.kind === 'code' || p.kind === 'diff') {
      const r = drawMorphPanel(ctx, prep, p.idx, p.rect, time);
      codeRect = p.rect;
      codeSlot = p;
      if (p.kind === 'code') codeScene = scene as CodeScene;
      runBtn = r.runBtn;
    } else {
      drawTerminalPanel(ctx, prep, p.idx, p.rect, time, dsl);
    }
    ctx.restore();
  }

  const hl = activeHighlight(prep, time, codeSlot?.idx ?? null);
  if (hl && codeRect && codeScene) {
    drawHighlight(
      ctx,
      { ...hl.scene, startTime: hl.start, duration: hl.end - hl.start },
      codeRect, codeScene, dsl, time,
    );
  }

  const click = activeScene(dsl, 'click', time);
  if (runBtn) drawRunButton(ctx, runBtn, click ? clamp((time - click.startTime) / click.duration, 0, 1) : -1);
  if (click && runBtn) drawClickFx(ctx, runBtn, time, click.startTime);

  // the mascot acts on top of everything in the world
  drawMascots(ctx, prep, time, codeSlot);
}

// ── Mascot: ONE persistent companion, always docked bottom-right ────────────────
// Bit stays put whenever code/terminal is on screen (drawWorld already skips this
// on full-screen cards). It never pops in and out per scene and never switches
// sides — a `mascot` scene only changes what it's DOING and which line it points
// at. Consistent presence, one direction.
function drawMascots(ctx: CanvasRenderingContext2D, prep: Prepared, time: number, codeSlot: PanelSlot | null) {
  const { dsl } = prep;
  const W = dsl.width, H = dsl.height;

  const termActive = dsl.scenes.some(
    (s) => s.type === 'terminal' && time >= s.startTime - 1e-6 && time < s.startTime + s.duration,
  );
  if (!codeSlot && !termActive) return; // no code on screen → no Bit (cards own the frame)

  // the mascot scene in effect right now (drives action + pointed line)
  let m: MascotScene | null = null;
  let mStart = -1;
  for (const s of dsl.scenes) {
    if (s.type !== 'mascot') continue;
    if (time >= s.startTime - 1e-6 && time < s.startTime + s.duration && s.startTime >= mStart) {
      m = s as MascotScene;
      mStart = s.startTime;
    }
  }

  const rs = H / 1080;
  const scale = 0.66 * rs;
  const x = W - 210 * rs; // pulled in from the edge so nothing clips
  const y = H - 236 * rs; // feet here; body rises into the right margin, fully in frame

  // aim: the pointed line if asked, else a soft gaze at the panel
  let aimX: number | undefined;
  let aimY: number | undefined;
  const rect = codeSlot?.rect;
  if (rect) {
    if (m && m.line) {
      const scene = dsl.scenes[codeSlot!.idx] as CodeScene | DiffScene;
      const lh = lineH(codeFont(scene, dsl));
      aimX = rect.x + rect.w - 40;
      aimY = rect.y + TITLE_H + PAD + (m.line - 0.5) * lh;
    } else {
      aimX = rect.x + rect.w * 0.5;
      aimY = rect.y + rect.h * 0.55;
    }
  }

  drawMascot(ctx, {
    x, y, scale,
    action: (m?.action as MascotAction) || 'idle',
    local: m ? time - m.startTime : time, // action clock (relative while acting)
    enterLocal: 999, // always fully present — no entrance pop on action changes
    life: Infinity,
    aimX, aimY,
    flip: true, // docked right, always facing the code
  });
}

/** Camera target following the changing region of a morphing code panel. */
function morphFocusTarget(prep: Prepared, slot: PanelSlot, time: number): FocusTarget | null {
  const plan = prep.morphs.get(slot.idx);
  if (!plan || plan.pureAdd) return null; // first appearances read fine unzoomed
  const scene = prep.dsl.scenes[slot.idx] as CodeScene | DiffScene;
  const T = plan.timing;
  const rows = plan.addedRows.length ? plan.addedRows : plan.removedRows;
  if (!rows.length) return null;

  const dsl = prep.dsl;
  const fs = codeFont(scene, dsl);
  const lh = lineH(fs);
  const bodyY = slot.rect.y + TITLE_H + PAD;
  const minR = Math.min(...rows);
  const maxR = Math.max(...rows);
  const cy = bodyY + ((minR + maxR) / 2 + 0.5) * lh;
  const span = (maxR - minR + 1) * lh;
  const lastAdd = plan.addedRows.length
    ? addRowAt(T, plan.addedRows.length - 1) + T.lineReveal
    : T.moveEnd;

  return {
    x: clamp(slot.rect.x + slot.rect.w / 2, dsl.width * 0.3, dsl.width * 0.7),
    y: cy,
    // gentle: a slight lean toward the change, not a lurch
    zoom: span < lh * 7 ? 1.05 : 1.02,
    strength:
      envelope(
        time,
        scene.startTime + T.moveStart - 0.15,
        scene.startTime + lastAdd + 0.9,
        0.7,
        0.85,
      ) * 0.7,
  };
}

// ── Sprites (template + keyframe tweens) ────────────────────────────────────────────
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

// ── Window chrome ─────────────────────────────────────────────────────────────────
function drawChrome(ctx: CanvasRenderingContext2D, rect: Rect, title: string, accentGlow = true): Rect {
  // soft accent bloom behind the window so it floats off the backdrop
  if (accentGlow) {
    const g = ctx.createRadialGradient(
      rect.x + rect.w / 2, rect.y + rect.h / 2, 0,
      rect.x + rect.w / 2, rect.y + rect.h / 2, Math.max(rect.w, rect.h) * 0.72,
    );
    g.addColorStop(0, 'rgba(139,92,246,0.055)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(rect.x - 180, rect.y - 180, rect.w + 360, rect.h + 360);
  }

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 30;
  const body = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
  body.addColorStop(0, '#1a1a23');
  body.addColorStop(0.12, C.panel);
  body.addColorStop(1, '#131318');
  ctx.fillStyle = body;
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 18);
  ctx.fill();
  ctx.restore();

  // title bar wash
  ctx.save();
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 18);
  ctx.clip();
  ctx.fillStyle = C.panelTop;
  ctx.fillRect(rect.x, rect.y, rect.w, TITLE_H);
  ctx.fillStyle = C.sep;
  ctx.fillRect(rect.x, rect.y + TITLE_H - 1, rect.w, 1);
  // glass top edge
  ctx.fillStyle = C.borderTop;
  ctx.fillRect(rect.x + 14, rect.y, rect.w - 28, 1);
  ctx.restore();

  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1.5;
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 18);
  ctx.stroke();

  // traffic lights
  [C.trafficRed, C.trafficYellow, C.trafficGreen].forEach((c, i) => {
    ctx.beginPath();
    ctx.fillStyle = c;
    ctx.arc(rect.x + 28 + i * 26, rect.y + TITLE_H / 2, 7, 0, Math.PI * 2);
    ctx.fill();
  });

  // filename tab
  ctx.font = `500 ${Math.round(TITLE_H * 0.36)}px ${MONO}`;
  const tw = ctx.measureText(title).width;
  const tabX = rect.x + 108;
  const tabW = tw + 44;
  ctx.fillStyle = 'rgba(255,255,255,0.045)';
  roundRect(ctx, tabX, rect.y + 9, tabW, TITLE_H - 18, 9);
  ctx.fill();
  ctx.fillStyle = C.accent;
  ctx.beginPath();
  ctx.arc(tabX + 17, rect.y + TITLE_H / 2, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c9c8d4';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, tabX + 30, rect.y + TITLE_H / 2 + 1);

  return { x: rect.x + PAD, y: rect.y + TITLE_H + PAD, w: rect.w - PAD * 2, h: rect.h - TITLE_H - PAD * 2 };
}

// ── Morph panel ───────────────────────────────────────────────────────────────────
// One renderer for `code` (morph from empty) and `diff` (morph between states).
// Kept tokens SLIDE from their old grid cell to their new one, removed tokens
// fade where they were, added tokens land line-by-line with a soft rise. No
// typewriter, no per-character clatter — the code reads as *edited*, not typed.
function drawMorphPanel(ctx: CanvasRenderingContext2D, prep: Prepared, idx: number, rect: Rect, time: number): { runBtn: Rect } {
  const dsl = prep.dsl;
  const scene = dsl.scenes[idx] as CodeScene | DiffScene;
  const plan = prep.morphs.get(idx)!;
  const T = plan.timing;
  const body = drawChrome(ctx, rect, scene.title || langLabel(scene.language));

  const fs = codeFont(scene, dsl);
  const lh = lineH(fs);
  ctx.font = `${fs}px ${MONO}`;
  ctx.textBaseline = 'alphabetic';
  const charW = ctx.measureText('M').width;
  const gutterW = fs * 2.4;
  const baseY = body.y + fs;
  const local = time - scene.startTime;

  const moveP = easeInOut(clamp((local - T.moveStart) / Math.max(T.moveEnd - T.moveStart, 0.01), 0, 1));
  const rowY = (r: number) => baseY + r * lh;
  const colX = (c: number) => body.x + gutterW + c * charW;
  const orderOf = new Map(plan.addedRows.map((r, i) => [r, i]));
  const removedSet = new Set(plan.removedRows);
  const rowRevealAt = (r: number) => addRowAt(T, orderOf.get(r) ?? 0);

  ctx.save();
  roundRect(ctx, rect.x, rect.y + TITLE_H, rect.w, rect.h - TITLE_H, 18);
  ctx.clip();

  // the line that landed most recently gets a fading focus wash
  let newest = -1;
  let newestAt = -Infinity;
  for (const r of plan.addedRows) {
    const at = rowRevealAt(r);
    if (local >= at && at > newestAt) { newest = r; newestAt = at; }
  }
  if (newest >= 0) {
    const glow = 1 - clamp((local - newestAt) / 0.9, 0, 1);
    if (glow > 0.01) {
      ctx.fillStyle = `rgba(167,139,250,${0.07 * glow})`;
      ctx.fillRect(rect.x + 6, rowY(newest) - fs, rect.w - 12, lh);
    }
  }

  // removed rows: red wash + − marker through the hold, gone with the move
  if (!plan.pureAdd) {
    const holdIn = easeInOut(clamp(local / 0.3, 0, 1));
    for (const r of plan.removedRows) {
      const a = holdIn * (1 - moveP);
      if (a <= 0.01) continue;
      ctx.fillStyle = `rgba(248,113,113,${0.1 * a})`;
      ctx.fillRect(rect.x + 6, rowY(r) - fs, rect.w - 12, lh);
      ctx.fillStyle = `rgba(248,113,113,${0.7 * a})`;
      ctx.font = `${Math.round(fs * 0.7)}px ${MONO}`;
      ctx.fillText('−', body.x, rowY(r));
    }
  }

  // line numbers: BEFORE grid fades out with the move, AFTER grid fades in
  ctx.font = `${Math.round(fs * 0.68)}px ${MONO}`;
  if (!plan.pureAdd && moveP < 0.999) {
    for (let r = 0; r < plan.beforeRows; r++) {
      if (removedSet.has(r)) continue; // the − marker owns that slot
      ctx.fillStyle = `rgba(255,255,255,${0.13 * (1 - moveP)})`;
      ctx.fillText(String(r + 1).padStart(2, ' '), body.x, rowY(r));
    }
  }
  for (let r = 0; r < plan.afterRows; r++) {
    const ord = orderOf.get(r);
    const a = ord != null
      ? easeOutCubic(clamp((local - rowRevealAt(r)) / T.lineReveal, 0, 1))
      : plan.pureAdd ? 1 : moveP;
    if (a <= 0.01) continue;
    const fresh = r === newest && local - newestAt < 0.9;
    ctx.fillStyle = fresh ? `rgba(167,139,250,${0.6 * a})` : `rgba(255,255,255,${0.13 * a})`;
    ctx.fillText(String(r + 1).padStart(2, ' '), body.x, rowY(r));
  }
  ctx.fillStyle = C.sep;
  ctx.fillRect(body.x + gutterW - fs * 0.7, body.y - PAD + 6, 1, rect.h - TITLE_H - 12);
  ctx.font = `${fs}px ${MONO}`;

  // tokens: each drawn as ONE crisp string on the monospace grid. Resting tokens
  // snap to integer pixels (no shimmer); only tokens actively sliding/landing move.
  const atRest = moveP >= 0.999;
  for (const tok of plan.tokens) {
    let x: number;
    let y: number;
    let a = 1;
    if (tok.kind === 'kept') {
      if (atRest || tok.fromCol === tok.toCol && tok.fromRow === tok.toRow) {
        x = colX(tok.toCol); y = rowY(tok.toRow);
      } else {
        x = lerp(colX(tok.fromCol), colX(tok.toCol), moveP);
        y = lerp(rowY(tok.fromRow), rowY(tok.toRow), moveP);
      }
    } else if (tok.kind === 'remove') {
      const fade = 1 - easeInOut(clamp((local - T.moveStart) / 0.35, 0, 1));
      if (fade <= 0.01) continue;
      a = fade;
      x = colX(tok.fromCol);
      y = rowY(tok.fromRow) + (1 - fade) * 8;
    } else {
      const at = rowRevealAt(tok.toRow) + Math.min(0.12, tok.toCol * 0.006);
      const p = easeOutCubic(clamp((local - at) / T.lineReveal, 0, 1));
      if (p <= 0.01) continue;
      a = p;
      x = colX(tok.toCol);
      y = rowY(tok.toRow) - (1 - p) * 10;
      if (p >= 0.999) { /* landed — draw on the grid */ }
    }
    ctx.globalAlpha = a;
    ctx.fillStyle = tok.color;
    // integer pixels keep glyphs sharp; monospace advance == charW so the whole
    // string lands exactly where per-character placement would, but crisper
    ctx.fillText(tok.text, Math.round(x), Math.round(y));
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  const btnW = 96, btnH = 32;
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
  roundRect(ctx, b.x, b.y, b.w, b.h, 9);
  ctx.fill();
  ctx.strokeStyle = active ? '#6ee7b7' : 'rgba(52,211,153,0.45)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, b.x, b.y, b.w, b.h, 9);
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
function drawTerminalPanel(ctx: CanvasRenderingContext2D, prep: Prepared, idx: number, rect: Rect, time: number, dsl: AnimationDSL) {
  const scene = dsl.scenes[idx] as TerminalScene;
  const body = drawChrome(ctx, rect, 'zsh — output', false);
  const fs = scene.fontSize || Math.round(dsl.height / 38);
  const lh = lineH(fs);
  ctx.font = `${fs}px ${MONO}`;
  ctx.textBaseline = 'alphabetic';
  const charW = ctx.measureText('M').width;
  const baseY = body.y + fs;

  ctx.save();
  roundRect(ctx, rect.x, rect.y + TITLE_H, rect.w, rect.h - TITLE_H, 18);
  ctx.clip();

  ctx.fillStyle = C.accent;
  ctx.fillText('❯', body.x, baseY);
  ctx.fillStyle = '#c9c8d4';
  ctx.fillText(' ' + ((scene.prompt || '').replace(/^\$\s*/, '') + (scene.command || '')).trim(), body.x + charW, baseY);

  // the PACED schedule from prepare() (narration-stretched, ANSI-stripped) —
  // the same one the Conductor keys keystroke sounds off, so they can't drift
  const { plain, colors } = parseAnsi(scene.output);
  const total = plain.length;
  const local = time - scene.startTime;
  const sched = prep.schedule.get(idx) || typeSchedule(plain, scene.typingSpeed);
  const shown = revealedCount(sched, local);
  const done = shown >= total;

  let li = 0, col = 0;
  let headX = body.x, headY = baseY + lh;
  for (let i = 0; i < plain.length; i++) {
    const ch = plain[i];
    if (ch === '\n') { li++; col = 0; continue; }
    const age = local - (sched[i] ?? Infinity);
    if (age > 0) {
      const x = body.x + col * charW;
      const y = baseY + lh * (li + 1);
      if (ch !== ' ') {
        ctx.globalAlpha = clamp(age / CHAR_FADE, 0, 1);
        ctx.fillStyle = colors[i] || C.terminal;
        ctx.fillText(ch, x, y);
        ctx.globalAlpha = 1;
      }
      headX = x + charW; headY = y;
    }
    col++;
  }
  ctx.restore();

  const blink = Math.floor(time * 1.6) % 2 === 0;
  if (!done || blink) {
    ctx.fillStyle = C.terminal;
    ctx.globalAlpha = done ? 0.6 : 1;
    ctx.fillRect(headX + 2, headY - fs + 2, charW * 0.55, fs);
    ctx.globalAlpha = 1;
  }
}

// ── Highlight overlay: dim the rest, glow the target ──────────────────────────────
function drawHighlight(ctx: CanvasRenderingContext2D, scene: { startLine: number; endLine: number; color?: string; startTime: number; duration: number }, codeRect: Rect, code: CodeScene, dsl: AnimationDSL, time: number) {
  const r = highlightRect(scene, codeRect, code, dsl);
  const p = easeOutCubic(clamp((time - scene.startTime) / 0.4, 0, 1));

  ctx.save();
  // dim everything in the code body except the band
  roundRect(ctx, codeRect.x, codeRect.y + TITLE_H, codeRect.w, codeRect.h - TITLE_H, 18);
  ctx.clip();
  ctx.fillStyle = `rgba(8,8,12,${0.5 * p})`;
  ctx.fillRect(codeRect.x, codeRect.y + TITLE_H, codeRect.w, Math.max(0, r.y - codeRect.y - TITLE_H));
  ctx.fillRect(codeRect.x, r.y + r.h, codeRect.w, Math.max(0, codeRect.y + codeRect.h - r.y - r.h));

  // glow band + accent bar
  ctx.globalAlpha = p;
  ctx.fillStyle = scene.color || 'rgba(167,139,250,0.09)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.shadowColor = withAlpha(C.accent, 0.9);
  ctx.shadowBlur = 14;
  ctx.fillStyle = C.accent;
  ctx.fillRect(r.x, r.y, 4, r.h);
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
  ctx.fillStyle = 'rgba(16,16,22,0.88)';
  roundRect(ctx, x0, y0, boxW, boxH, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(167,139,250,0.25)';
  ctx.lineWidth = 1;
  roundRect(ctx, x0, y0, boxW, boxH, 12);
  ctx.stroke();
  ctx.fillStyle = scene.color || C.text;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(scene.content, W / 2, cy + 1);
  ctx.textAlign = 'left';
  ctx.restore();
}

// ── Cards ──────────────────────────────────────────────────────────────────────
/** Fade envelope every card shares. */
function drawTitleCard(ctx: CanvasRenderingContext2D, scene: TitleScene, time: number, W: number, H: number) {
  const a = cardAlpha(scene, time);
  if (a <= 0) return;
  const el = time - scene.startTime;
  const accent = scene.accentColor || C.accent;
  const enter = easeOutCubic(clamp(el / 0.7, 0, 1));

  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(0, (1 - enter) * 22);
  ctx.textAlign = 'center';

  const fs = Math.round(H / 11);
  ctx.font = `800 ${fs}px ${MONO}`;
  ctx.fillStyle = C.text;
  ctx.textBaseline = 'middle';
  ctx.save();
  ctx.shadowColor = withAlpha(accent, 0.35);
  ctx.shadowBlur = 60;
  ctx.fillText(scene.text, W / 2, H * 0.44);
  ctx.restore();
  ctx.fillText(scene.text, W / 2, H * 0.44);

  // accent underline grows in
  const lineW = Math.min(ctx.measureText(scene.text).width * 0.6, W * 0.4) * enter;
  ctx.fillStyle = accent;
  ctx.fillRect(W / 2 - lineW / 2, H * 0.44 + fs * 0.75, lineW, 5);

  if (scene.subtitle) {
    ctx.font = `500 ${Math.round(H / 30)}px ${MONO}`;
    ctx.fillStyle = C.dim;
    ctx.fillText(scene.subtitle, W / 2, H * 0.44 + fs * 0.75 + Math.round(H / 30) * 2.2);
  }
  ctx.textAlign = 'left';
  ctx.restore();
}

function drawChapterCard(ctx: CanvasRenderingContext2D, scene: ChapterScene, time: number, W: number, H: number) {
  const a = cardAlpha(scene, time);
  if (a <= 0) return;
  const el = time - scene.startTime;
  const enter = easeOutCubic(clamp(el / 0.6, 0, 1));
  const sweep = easeOutExpo(clamp((el - 0.15) / 0.8, 0, 1));

  ctx.save();
  ctx.globalAlpha = a;
  const x0 = W * 0.16;
  const cy = H * 0.5;

  // ghost chapter number
  if (scene.number != null) {
    ctx.font = `800 ${Math.round(H / 3.4)}px ${MONO}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    ctx.fillText(String(scene.number).padStart(2, '0'), W * 0.55, cy - H * 0.02);
  }

  // sweeping accent bar
  ctx.fillStyle = C.accent;
  ctx.fillRect(x0, cy - H * 0.085, 6, H * 0.17 * sweep);

  ctx.translate((1 - enter) * -30, 0);
  if (scene.number != null) {
    ctx.font = `600 ${Math.round(H / 34)}px ${MONO}`;
    ctx.fillStyle = C.accent;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`CHAPTER ${String(scene.number).padStart(2, '0')}`, x0 + 36, cy - H * 0.035);
  }
  ctx.font = `700 ${Math.round(H / 14)}px ${MONO}`;
  ctx.fillStyle = C.text;
  ctx.fillText(scene.text, x0 + 34, cy + H * 0.045);
  ctx.restore();
}

/** Scene-relative moments each bullet begins landing (shared with the Conductor
 *  so reveal pops fire exactly with the visuals). */
export function bulletRevealTimes(scene: BulletsScene): number[] {
  const window = Math.min(scene.narrationDuration ?? scene.duration, scene.duration);
  const step = clamp((window - 1.2) / Math.max(scene.items.length, 1), 0.45, 1.6);
  const delay = scene.title ? 0.55 : 0.2;
  return scene.items.map((_, i) => delay + i * step);
}

/** Scene-relative moments each diagram node pops (shared with the Conductor). */
export function diagramNodeTimes(scene: DiagramScene): number[] {
  return scene.nodes.map((_, i) => 0.35 + i * 0.28);
}

function drawBulletsCard(ctx: CanvasRenderingContext2D, scene: BulletsScene, time: number, W: number, H: number) {
  const a = cardAlpha(scene, time);
  if (a <= 0) return;
  const local = time - scene.startTime;
  const items = scene.items;
  if (!items.length) return;

  // stagger spread across the narrated window so points land with the voice
  const window = Math.min(scene.narrationDuration ?? scene.duration, scene.duration);
  const step = clamp((window - 1.2) / Math.max(items.length, 1), 0.45, 1.6);

  ctx.save();
  ctx.globalAlpha = a;
  const maxW = Math.min(W * 0.58, 1150);
  const x0 = W / 2 - maxW / 2;
  const fs = Math.round(H / 22);
  const gapY = Math.round(fs * 2.3);
  const titleFs = Math.round(H / 16);
  const blockH = (scene.title ? titleFs * 2.2 : 0) + items.length * gapY;
  let y = H / 2 - blockH / 2 + fs;

  if (scene.title) {
    const p = easeOutCubic(clamp(local / 0.5, 0, 1));
    ctx.globalAlpha = a * p;
    ctx.font = `700 ${titleFs}px ${MONO}`;
    ctx.fillStyle = C.text;
    ctx.fillText(scene.title, x0, y);
    const uw = ctx.measureText(scene.title).width;
    ctx.fillStyle = C.accent;
    ctx.fillRect(x0, y + 14, Math.min(uw * 0.4, 180) * p, 4);
    y += titleFs * 2.2;
  }

  ctx.font = `500 ${fs}px ${MONO}`;
  for (let i = 0; i < items.length; i++) {
    const p = easeOutCubic(staggerProgress(local, i, step, 0.4, scene.title ? 0.55 : 0.2));
    if (p <= 0) { y += gapY; continue; }
    ctx.globalAlpha = a * p;
    const rise = (1 - p) * 16;

    // marker: small accent square that lands with a soft pop
    const pop = springOut(p);
    const ms = fs * 0.42 * pop;
    ctx.fillStyle = C.accent;
    roundRect(ctx, x0 + fs * 0.2 - ms / 2 + fs * 0.21, y - fs * 0.36 - ms / 2 + rise, ms, ms, 3);
    ctx.fill();

    ctx.fillStyle = C.text;
    ctx.fillText(items[i], x0 + fs * 1.6, y + rise);
    y += gapY;
  }
  ctx.restore();
}

function drawDiagramCard(ctx: CanvasRenderingContext2D, scene: DiagramScene, time: number, W: number, H: number) {
  const a = cardAlpha(scene, time);
  if (a <= 0) return;
  const local = time - scene.startTime;
  const fs = Math.round(H / 30);

  ctx.save();
  ctx.globalAlpha = a;

  if (scene.title) {
    const p = easeOutCubic(clamp(local / 0.5, 0, 1));
    ctx.globalAlpha = a * p;
    ctx.font = `700 ${Math.round(H / 20)}px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = C.text;
    ctx.fillText(scene.title, W / 2, H * 0.13);
    ctx.textAlign = 'left';
    ctx.globalAlpha = a;
  }

  // node geometry
  ctx.font = `600 ${fs}px ${MONO}`;
  const boxes = new Map<string, Rect>();
  for (const n of scene.nodes) {
    const tw = ctx.measureText(n.label).width;
    const w = tw + fs * 2.2;
    const h = fs * 2.6;
    boxes.set(n.id, { x: n.x * W - w / 2, y: n.y * H - h / 2, w, h });
  }

  const nodeStep = 0.28;
  const nodeAt = (i: number) => 0.35 + i * nodeStep;
  const edgesStart = nodeAt(scene.nodes.length - 1) + 0.5;

  // edges draw on after their endpoints exist
  for (let i = 0; i < scene.edges.length; i++) {
    const e = scene.edges[i];
    const fromR = boxes.get(e.from)!;
    const toR = boxes.get(e.to)!;
    const p = easeInOut(clamp((local - edgesStart - i * 0.3) / 0.45, 0, 1));
    if (p <= 0) continue;

    const x1 = fromR.x + fromR.w / 2, y1 = fromR.y + fromR.h / 2;
    const x2 = toR.x + toR.w / 2, y2 = toR.y + toR.h / 2;
    // trim to box edges
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const trim1 = Math.min(Math.abs(fromR.w / 2 / (ux || 1e-9)), Math.abs(fromR.h / 2 / (uy || 1e-9))) + 8;
    const trim2 = Math.min(Math.abs(toR.w / 2 / (ux || 1e-9)), Math.abs(toR.h / 2 / (uy || 1e-9))) + 14;
    const sx = x1 + ux * trim1, sy = y1 + uy * trim1;
    const ex = x2 - ux * trim2, ey = y2 - uy * trim2;
    const hx = lerp(sx, ex, p), hy = lerp(sy, ey, p);

    ctx.strokeStyle = 'rgba(167,139,250,0.6)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(hx, hy);
    ctx.stroke();

    if (p >= 1) {
      // arrowhead
      ctx.fillStyle = 'rgba(167,139,250,0.85)';
      ctx.beginPath();
      ctx.moveTo(ex + ux * 12, ey + uy * 12);
      ctx.lineTo(ex - uy * 6, ey + ux * 6);
      ctx.lineTo(ex + uy * 6, ey - ux * 6);
      ctx.closePath();
      ctx.fill();
    }
    if (e.label && p > 0.6) {
      ctx.globalAlpha = a * clamp((p - 0.6) / 0.4, 0, 1);
      ctx.font = `500 ${Math.round(fs * 0.72)}px ${MONO}`;
      ctx.textAlign = 'center';
      const mx = (sx + ex) / 2, my = (sy + ey) / 2;
      const lw = ctx.measureText(e.label).width;
      ctx.fillStyle = '#0b0b10';
      ctx.fillRect(mx - lw / 2 - 8, my - fs * 0.7, lw + 16, fs * 1.2);
      ctx.fillStyle = C.dim;
      ctx.fillText(e.label, mx, my);
      ctx.textAlign = 'left';
      ctx.font = `600 ${fs}px ${MONO}`;
      ctx.globalAlpha = a;
    }
  }

  // nodes pop in
  for (let i = 0; i < scene.nodes.length; i++) {
    const n = scene.nodes[i];
    const r = boxes.get(n.id)!;
    const p = clamp((local - nodeAt(i)) / 0.45, 0, 1);
    if (p <= 0) continue;
    const pop = springOut(p);
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;

    ctx.save();
    ctx.globalAlpha = a * easeOutCubic(p);
    ctx.translate(cx, cy);
    ctx.scale(pop, pop);
    ctx.translate(-cx, -cy);

    const accent = n.color || C.accent;
    ctx.shadowColor = withAlpha(accent, 0.35);
    ctx.shadowBlur = scene.aesthetic === 'sketch' ? 0 : 26;
    ctx.fillStyle = '#191922';
    if (scene.aesthetic === 'sketch') {
      sketchRoundRect(ctx, r.x, r.y, r.w, r.h, 13);
      ctx.fill();
      ctx.strokeStyle = withAlpha(accent, 0.85);
      ctx.lineWidth = 2;
      sketchRoundRect(ctx, r.x, r.y, r.w, r.h, 13);
      ctx.stroke();
    } else {
      roundRect(ctx, r.x, r.y, r.w, r.h, 13);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = withAlpha(accent, 0.65);
      ctx.lineWidth = 1.5;
      roundRect(ctx, r.x, r.y, r.w, r.h, 13);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = C.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(n.label, cx, cy + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }
  ctx.restore();
}

function drawQuoteCard(ctx: CanvasRenderingContext2D, scene: QuoteScene, time: number, W: number, H: number) {
  const a = cardAlpha(scene, time);
  if (a <= 0) return;
  const el = time - scene.startTime;
  const enter = easeOutCubic(clamp(el / 0.7, 0, 1));

  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(0, (1 - enter) * 18);

  const fs = Math.round(H / 16);
  ctx.font = `600 ${fs}px ${MONO}`;
  const lines = wrapText(ctx, scene.text, W * 0.62);
  const lh = fs * 1.5;
  let y = H / 2 - ((lines.length - 1) * lh) / 2;

  // oversized quote mark
  ctx.font = `800 ${Math.round(H / 4.5)}px Georgia, serif`;
  ctx.fillStyle = withAlpha(C.accent, 0.22);
  ctx.fillText('“', W * 0.14, H * 0.38);

  ctx.font = `600 ${fs}px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.text;
  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += lh;
  }
  if (scene.attribution) {
    ctx.font = `500 ${Math.round(H / 32)}px ${MONO}`;
    ctx.fillStyle = C.accent;
    ctx.fillText(`— ${scene.attribution}`, W / 2, y + fs * 0.6);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

function drawBigStatCard(ctx: CanvasRenderingContext2D, scene: BigStatScene, time: number, W: number, H: number) {
  const a = cardAlpha(scene, time);
  if (a <= 0) return;
  const el = time - scene.startTime;

  // numeric part counts up; prefix/suffix stay put ("~1,200ms" → 0→1200)
  const m = scene.value.match(/^([^\d]*)([\d,.]+)(.*)$/);
  let display = scene.value;
  if (m) {
    const target = parseFloat(m[2].replace(/,/g, ''));
    if (isFinite(target)) {
      const p = easeOutExpo(clamp(el / 1.4, 0, 1));
      const v = target * p;
      const hasDecimals = m[2].includes('.') && !Number.isInteger(target);
      const num = hasDecimals ? v.toFixed(1) : Math.round(v).toLocaleString('en-US');
      display = `${m[1]}${num}${m[3]}`;
    }
  }

  ctx.save();
  ctx.globalAlpha = a;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const fs = Math.round(H / 4.6);
  ctx.font = `800 ${fs}px ${MONO}`;
  ctx.save();
  ctx.shadowColor = withAlpha(C.accent, 0.4);
  ctx.shadowBlur = 80;
  ctx.fillStyle = C.accent;
  ctx.fillText(display, W / 2, H * 0.46);
  ctx.restore();

  ctx.font = `500 ${Math.round(H / 24)}px ${MONO}`;
  ctx.fillStyle = C.dim;
  ctx.fillText(scene.label, W / 2, H * 0.46 + fs * 0.72);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

// ── Quiz card ──────────────────────────────────────────────────────────────────
// Layout is fixed (no text measurement) so the DOM overlay can map clicks onto
// the same rects after CSS scaling.
export interface QuizLayout {
  card: Rect;
  question: Rect;
  options: Rect[];
}

export function quizLayout(scene: QuizScene, W: number, H: number): QuizLayout {
  const cardW = Math.min(W * 0.6, 1160);
  const optH = 84;
  const optGap = 18;
  const qH = 150;
  const pad = 44;
  const cardH = pad + qH + scene.options.length * (optH + optGap) + pad - optGap + 26;
  const card: Rect = { x: W / 2 - cardW / 2, y: H / 2 - cardH / 2, w: cardW, h: cardH };
  const question: Rect = { x: card.x + pad, y: card.y + pad, w: cardW - pad * 2, h: qH };
  const options: Rect[] = scene.options.map((_, i) => ({
    x: card.x + pad,
    y: card.y + pad + qH + 26 + i * (optH + optGap),
    w: cardW - pad * 2,
    h: optH,
  }));
  return { card, question, options };
}

/** When the export (non-interactive) rendering reveals the right answer. */
export function quizRevealAt(scene: QuizScene): number {
  return Math.max(scene.duration * 0.62, Math.min(scene.narrationDuration ?? 2.5, scene.duration - 1.4));
}

function drawQuizCard(ctx: CanvasRenderingContext2D, scene: QuizScene, time: number, W: number, H: number, ui?: RenderUI) {
  const a = cardAlpha(scene, time);
  if (a <= 0) return;
  const local = time - scene.startTime;
  const enter = easeOutCubic(clamp(local / 0.55, 0, 1));
  const lay = quizLayout(scene, W, H);
  const quiz = ui?.quiz;
  // in the live player NEVER reveal on a timer — only once the learner answers.
  // the timed reveal is for export (non-interactive) rendering only.
  const revealed = ui?.interactive
    ? quiz?.selected != null
    : local >= quizRevealAt(scene);
  const selected = quiz?.selected ?? null;

  ctx.save();
  ctx.globalAlpha = a * enter;
  ctx.translate(0, (1 - enter) * 26);

  // card
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 70;
  ctx.shadowOffsetY = 30;
  ctx.fillStyle = '#15151d';
  roundRect(ctx, lay.card.x, lay.card.y, lay.card.w, lay.card.h, 22);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1.5;
  roundRect(ctx, lay.card.x, lay.card.y, lay.card.w, lay.card.h, 22);
  ctx.stroke();

  // "checkpoint" eyebrow
  const eyebrowFs = Math.round(H / 60);
  ctx.font = `700 ${eyebrowFs}px ${MONO}`;
  ctx.fillStyle = C.accent;
  ctx.fillText('◆ CHECKPOINT', lay.question.x, lay.question.y + eyebrowFs);

  // question (up to 2 wrapped lines)
  const qFs = Math.round(H / 26);
  ctx.font = `700 ${qFs}px ${MONO}`;
  ctx.fillStyle = C.text;
  const qLines = wrapText(ctx, scene.question, lay.question.w).slice(0, 2);
  qLines.forEach((l, i) => {
    ctx.fillText(l, lay.question.x, lay.question.y + eyebrowFs + 24 + qFs + i * qFs * 1.4);
  });

  // options
  const oFs = Math.round(H / 36);
  for (let i = 0; i < scene.options.length; i++) {
    const r = lay.options[i];
    const p = easeOutCubic(staggerProgress(local, i, 0.14, 0.3, 0.35));
    if (p <= 0) continue;

    const isAnswer = i === scene.answerIndex;
    const isSelected = selected === i;
    let border = 'rgba(255,255,255,0.12)';
    let fill = 'rgba(255,255,255,0.03)';
    let badge = C.dim;
    if (revealed && isAnswer) {
      border = withAlpha(C.green, 0.8);
      fill = withAlpha(C.green, 0.08);
      badge = C.green;
    } else if (revealed && isSelected && !isAnswer) {
      border = withAlpha(C.red, 0.7);
      fill = withAlpha(C.red, 0.07);
      badge = C.red;
    }

    ctx.save();
    ctx.globalAlpha = a * enter * p;
    ctx.translate(0, (1 - p) * 14);
    ctx.fillStyle = fill;
    roundRect(ctx, r.x, r.y, r.w, r.h, 14);
    ctx.fill();
    ctx.strokeStyle = border;
    ctx.lineWidth = 1.5;
    roundRect(ctx, r.x, r.y, r.w, r.h, 14);
    ctx.stroke();

    // letter badge
    ctx.font = `700 ${oFs}px ${MONO}`;
    ctx.fillStyle = badge;
    ctx.textBaseline = 'middle';
    ctx.fillText(String.fromCharCode(65 + i), r.x + 30, r.y + r.h / 2 + 1);

    ctx.font = `500 ${oFs}px ${MONO}`;
    ctx.fillStyle = C.text;
    ctx.fillText(scene.options[i], r.x + 76, r.y + r.h / 2 + 1);

    if (revealed && isAnswer) {
      ctx.font = `700 ${oFs}px ${MONO}`;
      ctx.fillStyle = C.green;
      ctx.textAlign = 'right';
      ctx.fillText('✓', r.x + r.w - 26, r.y + r.h / 2 + 1);
      ctx.textAlign = 'left';
    } else if (revealed && isSelected && !isAnswer) {
      ctx.font = `700 ${oFs}px ${MONO}`;
      ctx.fillStyle = C.red;
      ctx.textAlign = 'right';
      ctx.fillText('✕', r.x + r.w - 26, r.y + r.h / 2 + 1);
      ctx.textAlign = 'left';
    }
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // explanation under the card once revealed
  if (revealed && scene.explanation) {
    const eFs = Math.round(H / 42);
    ctx.font = `500 ${eFs}px ${MONO}`;
    ctx.globalAlpha = a * 0.9;
    ctx.fillStyle = C.dim;
    ctx.textAlign = 'center';
    const lines = wrapText(ctx, scene.explanation, lay.card.w * 0.9);
    lines.slice(0, 2).forEach((l, i) => {
      ctx.fillText(l, W / 2, lay.card.y + lay.card.h + 44 + i * eFs * 1.5);
    });
    ctx.textAlign = 'left';
  }

  // Bit sits beside the card and reacts: thinking while the learner decides,
  // celebrating a right answer, shocked by a wrong one. In export (no ui) it
  // celebrates at the timed reveal so the character survives into the video.
  const mascotLocal = quiz
    ? ui?.uiTime ?? 0
    : revealed ? local - quizRevealAt(scene) : -1;
  if (mascotLocal >= 0) {
    ctx.globalAlpha = a;
    const action: MascotAction = quiz
      ? quiz.selected == null ? 'think' : quiz.correct ? 'celebrate' : 'shocked'
      : 'celebrate';
    drawMascot(ctx, {
      // right of the card — same side Bit lives on during code (consistency)
      x: lay.card.x + lay.card.w + 104 * (H / 1080),
      y: lay.card.y + lay.card.h,
      scale: (H / 1080) * 0.82,
      action,
      local: mascotLocal,
      enterLocal: 999,
      life: Infinity,
      aimX: lay.card.x + lay.card.w * 0.75,
      aimY: lay.card.y + 60,
      flip: true,
    });
  }
  ctx.restore();
}

// ── Challenge card ───────────────────────────────────────────────────────────────
// Interactive: the DOM overlay (ChallengeCard.tsx) owns the editor; this canvas
// layer is the backdrop + the export rendering (prompt, then the solution).
function drawChallengeCard(ctx: CanvasRenderingContext2D, scene: ChallengeScene, time: number, W: number, H: number, ui?: RenderUI) {
  const a = cardAlpha(scene, time);
  if (a <= 0) return;
  const local = time - scene.startTime;
  const enter = easeOutCubic(clamp(local / 0.55, 0, 1));
  const cardW = Math.min(W * 0.66, 1240);
  const cardH = Math.min(H * 0.62, 640);
  const cx = W / 2 - cardW / 2;
  const cy = H / 2 - cardH / 2;
  // export reveals the solution partway through; interactive never does
  const reveal = !ui?.interactive && local > Math.min(scene.duration * 0.5, 4);

  ctx.save();
  ctx.globalAlpha = a * enter;
  ctx.translate(0, (1 - enter) * 26);

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 70;
  ctx.shadowOffsetY = 30;
  ctx.fillStyle = '#15151d';
  roundRect(ctx, cx, cy, cardW, cardH, 22);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1.5;
  roundRect(ctx, cx, cy, cardW, cardH, 22);
  ctx.stroke();

  const pad = 44;
  // eyebrow
  const ebFs = Math.round(H / 60);
  ctx.font = `700 ${ebFs}px ${MONO}`;
  ctx.fillStyle = C.green;
  ctx.fillText('◆ YOUR TURN', cx + pad, cy + pad + ebFs);

  // prompt
  const pFs = Math.round(H / 28);
  ctx.font = `700 ${pFs}px ${MONO}`;
  ctx.fillStyle = C.text;
  const pLines = wrapText(ctx, scene.prompt, cardW - pad * 2).slice(0, 3);
  let y = cy + pad + ebFs + 30 + pFs;
  for (const l of pLines) { ctx.fillText(l, cx + pad, y); y += pFs * 1.35; }

  // code box (starter, or the solution on export reveal)
  const boxY = y + 14;
  const boxH = cy + cardH - pad - boxY;
  ctx.fillStyle = '#0e0e14';
  roundRect(ctx, cx + pad, boxY, cardW - pad * 2, boxH, 12);
  ctx.fill();
  ctx.strokeStyle = C.sep;
  roundRect(ctx, cx + pad, boxY, cardW - pad * 2, boxH, 12);
  ctx.stroke();

  const codeFs = Math.round(H / 40);
  ctx.font = `${codeFs}px ${MONO}`;
  ctx.fillStyle = reveal ? C.terminal : C.dim;
  const src = (reveal ? scene.solution : scene.starterCode) || '';
  src.split('\n').slice(0, Math.floor((boxH - 24) / (codeFs * 1.5))).forEach((line, i) => {
    ctx.fillText(line, cx + pad + 20, boxY + 24 + codeFs + i * codeFs * 1.5);
  });

  // footer label
  ctx.font = `500 ${Math.round(H / 52)}px ${MONO}`;
  ctx.fillStyle = C.dim;
  ctx.textAlign = 'right';
  ctx.fillText(reveal ? 'one solution' : `${scene.tests.length} tests`, cx + cardW - pad, boxY - 16);
  ctx.textAlign = 'left';
  ctx.restore();

  // Bit cheers the challenge on (right side, consistent)
  const mLocal = ui?.interactive ? (ui.uiTime ?? 0) : (reveal ? local : 0.4);
  ctx.globalAlpha = a;
  drawMascot(ctx, {
    x: cx + cardW + 100 * (H / 1080),
    y: cy + cardH,
    scale: (H / 1080) * 0.8,
    action: reveal ? 'celebrate' : 'point',
    local: mLocal,
    enterLocal: 999,
    life: Infinity,
    aimX: cx + cardW * 0.7,
    aimY: cy + cardH * 0.4,
    flip: true,
  });
}

// ── Concept visualization (LEAP 4) ──────────────────────────────────────────────
// Animate the IDEA: an array being sorted, a pointer walking, the call stack
// growing, a variable accumulating. Steps carry full state; we tween between the
// previous and current step so values pop, pointers glide, and stack frames
// push/pop. One general renderer covers sorting, searching, recursion, loops.

/** Scene-relative time each step begins (shared with the Conductor for cues). */
export function vizStepTimes(scene: VizScene): number[] {
  const n = Math.max(scene.steps.length, 1);
  const window = Math.min(scene.narrationDuration ?? scene.duration, scene.duration);
  const slot = window / n;
  return scene.steps.map((_, i) => i * slot);
}

function vizStateAt(scene: VizScene, local: number): { prev: VizStep; cur: VizStep; tp: number } {
  const n = Math.max(scene.steps.length, 1);
  const window = Math.min(scene.narrationDuration ?? scene.duration, scene.duration);
  const slot = window / n;
  const idx = clamp(Math.floor(local / slot), 0, n - 1);
  const transDur = Math.min(0.55, slot * 0.6);
  const tp = easeInOut(clamp((local - idx * slot) / transDur, 0, 1));
  return { prev: scene.steps[Math.max(0, idx - 1)] || {}, cur: scene.steps[idx] || {}, tp };
}

function drawVizCard(ctx: CanvasRenderingContext2D, scene: VizScene, time: number, W: number, H: number) {
  const a = cardAlpha(scene, time);
  if (a <= 0 || !scene.steps.length) return;
  const local = time - scene.startTime;
  const { prev, cur, tp } = vizStateAt(scene, local);

  ctx.save();
  ctx.globalAlpha = a;

  // title
  if (scene.title) {
    ctx.font = `700 ${Math.round(H / 22)}px ${MONO}`;
    ctx.fillStyle = C.text;
    ctx.textAlign = 'center';
    ctx.fillText(scene.title, W / 2, H * 0.14);
    ctx.textAlign = 'left';
  }

  // stable geometry across steps (size for the largest state so nothing jumps)
  const maxLen = Math.max(1, ...scene.steps.map((s) => s.array?.length || 0));
  const hasStack = scene.steps.some((s) => (s.stack?.length || 0) > 0);
  const arrAreaW = (hasStack ? W * 0.62 : W * 0.82);
  const cw = Math.min(122, arrAreaW / maxLen - 14);
  const gap = 14;
  const rowW = maxLen * cw + (maxLen - 1) * gap;
  const arrCX = hasStack ? W * 0.40 : W / 2;
  const cx0 = arrCX - rowW / 2;
  const arrY = H * 0.5 - cw / 2;
  const cellX = (i: number) => cx0 + i * (cw + gap);

  // ── variables row (above the array) ──
  drawVizVars(ctx, prev.vars, cur.vars, tp, arrCX, arrY - cw * 0.9, H);

  // ── array cells ──
  const arr = cur.array || prev.array;
  if (arr) {
    const hl = new Set(cur.highlight || []);
    const done = new Set(cur.done || []);
    const cmp = new Set(cur.compare || []);
    for (let i = 0; i < arr.length; i++) {
      const x = cellX(i);
      let border = 'rgba(255,255,255,0.16)';
      let fill = '#1a1a24';
      let glow = '';
      if (done.has(i)) { border = withAlpha(C.green, 0.8); fill = withAlpha(C.green, 0.1); glow = C.green; }
      else if (cmp.has(i)) { border = withAlpha('#fbbf24', 0.85); fill = 'rgba(251,191,36,0.1)'; glow = '#fbbf24'; }
      else if (hl.has(i)) { border = withAlpha(C.accent, 0.85); fill = withAlpha(C.accent, 0.12); glow = C.accent; }

      ctx.save();
      if (glow) { ctx.shadowColor = withAlpha(glow, 0.6); ctx.shadowBlur = 22; }
      ctx.fillStyle = fill;
      roundRect(ctx, x, arrY, cw, cw, 12);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = border;
      ctx.lineWidth = 2;
      roundRect(ctx, x, arrY, cw, cw, 12);
      ctx.stroke();

      // value: pop when it changed from the previous step
      const changed = prev.array && prev.array[i] !== arr[i];
      const pop = changed ? 0.7 + 0.3 * tp : 1;
      ctx.save();
      ctx.globalAlpha = a * (changed ? 0.5 + 0.5 * tp : 1);
      ctx.translate(x + cw / 2, arrY + cw / 2);
      ctx.scale(pop, pop);
      ctx.font = `700 ${Math.round(cw * 0.4)}px ${MONO}`;
      ctx.fillStyle = C.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(arr[i]), 0, 1);
      ctx.restore();

      // index label
      ctx.font = `${Math.round(cw * 0.22)}px ${MONO}`;
      ctx.fillStyle = C.dim;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(String(i), x + cw / 2, arrY + cw + Math.round(cw * 0.34));
    }
    ctx.textAlign = 'left';

    // ── pointers (glide between steps) ──
    drawVizPointers(ctx, prev.pointers, cur.pointers, tp, cellX, cw, arrY + cw + cw * 0.5, a);
  }

  // ── stack (right side) ──
  if (hasStack) drawVizStack(ctx, prev.stack || [], cur.stack || [], tp, W * 0.82, H, a);

  // ── caption ──
  if (cur.caption) {
    const fs = Math.round(H / 34);
    ctx.font = `500 ${fs}px ${MONO}`;
    ctx.globalAlpha = a * (0.4 + 0.6 * tp);
    ctx.fillStyle = C.text;
    ctx.textAlign = 'center';
    const lines = wrapText(ctx, cur.caption, W * 0.7).slice(0, 2);
    lines.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.8 + i * fs * 1.4));
    ctx.textAlign = 'left';
  }

  ctx.restore();
}

function drawVizVars(ctx: CanvasRenderingContext2D, prev: Record<string, string> | undefined, cur: Record<string, string> | undefined, tp: number, cx: number, y: number, H: number) {
  const vars = cur || prev;
  if (!vars) return;
  const keys = Object.keys(vars);
  if (!keys.length) return;
  const boxW = 148, boxH = 84, gap = 20;
  // the box is anchored so its BOTTOM sits at `y` (just above the array)
  const top = y - boxH;
  const totalW = keys.length * boxW + (keys.length - 1) * gap;
  let x = cx - totalW / 2;
  const kFs = Math.round(H / 56), vFs = Math.round(H / 38);
  ctx.textBaseline = 'alphabetic';
  for (const k of keys) {
    const changed = prev && prev[k] !== vars[k];
    ctx.fillStyle = '#191922';
    roundRect(ctx, x, top, boxW, boxH, 11);
    ctx.fill();
    ctx.strokeStyle = changed ? withAlpha(C.accent, 0.5 + 0.4 * tp) : C.border;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x, top, boxW, boxH, 11);
    ctx.stroke();
    ctx.textAlign = 'center';
    // label near the top
    ctx.font = `${kFs}px ${MONO}`;
    ctx.fillStyle = C.dim;
    ctx.fillText(k, x + boxW / 2, top + kFs + 12);
    // value in the lower half, with room
    ctx.font = `700 ${vFs}px ${MONO}`;
    ctx.fillStyle = changed ? C.accent : C.text;
    const pop = changed ? 0.7 + 0.3 * tp : 1;
    ctx.save();
    ctx.translate(x + boxW / 2, top + boxH - 18);
    ctx.scale(pop, pop);
    ctx.fillText(String(vars[k]), 0, 0);
    ctx.restore();
    x += boxW + gap;
  }
  ctx.textAlign = 'left';
}

function drawVizPointers(ctx: CanvasRenderingContext2D, prev: VizStep['pointers'], cur: VizStep['pointers'], tp: number, cellX: (i: number) => number, cw: number, y: number, alpha: number) {
  const list = cur || [];
  const prevBy = new Map((prev || []).map((p) => [p.name, p.index]));
  const curNames = new Set(list.map((p) => p.name));
  const fs = Math.round(cw * 0.26);
  // draw current pointers (glide from previous index if it existed)
  for (const p of list) {
    const from = prevBy.has(p.name) ? prevBy.get(p.name)! : p.index;
    const idx = lerp(from, p.index, tp);
    const x = cellX(idx) + cw / 2;
    ctx.save();
    ctx.globalAlpha = alpha * (prevBy.has(p.name) ? 1 : tp);
    ctx.fillStyle = C.accent;
    // arrow head
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x - 9, y + 12);
    ctx.lineTo(x + 9, y + 12);
    ctx.closePath();
    ctx.fill();
    ctx.font = `700 ${fs}px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillText(p.name, x, y + 12 + fs + 4);
    ctx.restore();
  }
  // fade out pointers that were removed
  for (const p of prev || []) {
    if (curNames.has(p.name)) continue;
    const x = cellX(p.index) + cw / 2;
    ctx.save();
    ctx.globalAlpha = alpha * (1 - tp) * 0.7;
    ctx.fillStyle = C.dim;
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x - 9, y + 12);
    ctx.lineTo(x + 9, y + 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.textAlign = 'left';
}

function drawVizStack(ctx: CanvasRenderingContext2D, prev: string[], cur: string[], tp: number, cx: number, H: number, alpha: number) {
  const frameW = 220, frameH = 52, gap = 8;
  const baseY = H * 0.72;
  const growing = cur.length > prev.length;
  const shrinking = cur.length < prev.length;
  const frames = growing ? cur : prev; // draw whichever has the extra frame

  ctx.textAlign = 'center';
  ctx.font = `600 ${Math.round(frameH * 0.4)}px ${MONO}`;
  for (let i = 0; i < frames.length; i++) {
    const isNewTop = growing && i === cur.length - 1;
    const isPoppingTop = shrinking && i === prev.length - 1;
    const y = baseY - i * (frameH + gap);
    let a = alpha;
    let dx = 0;
    if (isNewTop) { a = alpha * tp; dx = (1 - tp) * 40; }        // slide/fade in
    else if (isPoppingTop) { a = alpha * (1 - tp); dx = tp * 40; } // slide/fade out

    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = i === (growing ? cur.length : prev.length) - 1 ? withAlpha(C.accent, 0.14) : '#191922';
    roundRect(ctx, cx - frameW / 2 + dx, y - frameH, frameW, frameH, 9);
    ctx.fill();
    ctx.strokeStyle = i === (growing ? cur.length : prev.length) - 1 ? withAlpha(C.accent, 0.7) : C.border;
    ctx.lineWidth = 1.5;
    roundRect(ctx, cx - frameW / 2 + dx, y - frameH, frameW, frameH, 9);
    ctx.stroke();
    ctx.fillStyle = C.text;
    ctx.fillText(frames[i], cx + dx, y - frameH / 2 + Math.round(frameH * 0.15));
    ctx.restore();
  }
  // label
  ctx.globalAlpha = alpha * 0.6;
  ctx.font = `600 ${Math.round(frameH * 0.32)}px ${MONO}`;
  ctx.fillStyle = C.dim;
  ctx.fillText('call stack', cx, baseY + 34);
  ctx.textAlign = 'left';
}


// ── Narration captions (burned-in subtitles from the voiceover script) ─────────
/** Word wrap into subtitle-sized chunks, balanced so none ends up a stub. */
export function captionChunks(text: string, maxChars = 52): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const total = words.join(' ').length;
  const n = Math.max(1, Math.ceil(total / maxChars));
  const perChunk = total / n;
  const chunks: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && next.length > perChunk && chunks.length < n - 1) {
      chunks.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/** Caption pages for a scene: exact word timings when the narration pipeline
 *  supplied them, estimated spread otherwise. Cached on the Prepared. */
function captionPagesFor(prep: Prepared, sceneIndex: number): CaptionPage[] {
  if (!prep.captionPages) prep.captionPages = new Map();
  const hit = prep.captionPages.get(sceneIndex);
  if (hit) return hit;
  const scene = prep.dsl.scenes[sceneIndex];
  const words = prep.words?.get(sceneIndex);
  // narrow (9:16) frames take fewer words per page so the pill fits
  const maxChars = prep.dsl.width < prep.dsl.height ? 24 : 42;
  const pages =
    words && words.length
      ? buildCaptionPages(words, maxChars)
      : scene.narration
        ? estimatedCaptionPages(
            scene.narration,
            Math.min(scene.narrationDuration ?? scene.duration, scene.duration),
            maxChars,
          )
        : [];
  prep.captionPages.set(sceneIndex, pages);
  return pages;
}

function drawNarrationCaption(ctx: CanvasRenderingContext2D, prep: Prepared, time: number) {
  const { dsl } = prep;
  if (dsl.captions === false) return;

  // the narrated scene whose speech window covers `time`
  let scene: (typeof dsl.scenes)[number] | null = null;
  let sceneIndex = -1;
  dsl.scenes.forEach((s, i) => {
    if (!s.narration) return;
    const speech = s.narrationDuration ?? s.duration;
    if (time >= s.startTime && time < s.startTime + Math.min(speech + 0.3, s.duration)) {
      if (!scene || s.startTime >= scene.startTime) { scene = s; sceneIndex = i; }
    }
  });
  if (!scene || sceneIndex < 0) return;

  const pages = captionPagesFor(prep, sceneIndex);
  if (!pages.length) return;

  const local = time - (scene as { startTime: number }).startTime;
  let page: CaptionPage | null = null;
  for (const p of pages) {
    if (local >= p.start - 0.05 && local < p.end + 0.25) page = p;
    if (p.start > local) break;
  }
  if (!page) return;

  const W = dsl.width, H = dsl.height;
  const fs = Math.round(Math.min(H / 33, W / 24));
  ctx.save();
  ctx.font = `500 ${fs}px ${MONO}`;
  const space = ctx.measureText(' ').width;
  const wordWidths = page.words.map((w) => ctx.measureText(w.word).width);
  const textW = wordWidths.reduce((a, b) => a + b, 0) + space * (page.words.length - 1);
  const padX = 26, padY = 13;
  const boxW = textW + padX * 2, boxH = fs + padY * 2;
  const cy = H - 78;
  ctx.globalAlpha = 0.96;
  ctx.fillStyle = 'rgba(10,10,15,0.8)';
  roundRect(ctx, W / 2 - boxW / 2, cy - boxH / 2, boxW, boxH, 11);
  ctx.fill();

  // karaoke: spoken words bright, the sounding word in accent, upcoming dimmed
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  let x = W / 2 - textW / 2;
  page.words.forEach((w, i) => {
    const spoken = local >= w.end;
    const current = local >= w.start && local < w.end;
    ctx.fillStyle = current ? C.accent : spoken ? '#f0f0f4' : 'rgba(240,240,244,0.45)';
    if (current) {
      ctx.shadowColor = withAlpha(C.accent, 0.55);
      ctx.shadowBlur = 12;
    }
    ctx.fillText(w.word, x, cy + 1);
    ctx.shadowBlur = 0;
    x += wordWidths[i] + space;
  });
  ctx.restore();
}

// ── Real browser recording card ─────────────────────────────────────────────────
// A capture-browser.mts clip inside the studio window chrome: same float/glow
// as every other surface, but the page inside is a REAL recording. The live
// player drift-corrects the <video> here; exports use syncSceneVideos for
// frame-exact seeks. Without a video (Node, missing file) it draws a slate.
function drawBrowserRecCard(
  ctx: CanvasRenderingContext2D,
  prep: Prepared,
  scene: BrowserRecScene,
  time: number,
  W: number,
  H: number,
) {
  const idx = prep.dsl.scenes.indexOf(scene);
  const video = prep.videos?.get(idx);
  const local = time - scene.startTime;

  const win: Rect = { x: W * 0.07, y: H * 0.075, w: W * 0.86, h: H * 0.85 };
  const enter = easeOutCubic(clamp(local / 0.5, 0, 1));
  ctx.save();
  ctx.globalAlpha = enter;
  ctx.translate(0, (1 - enter) * 24);

  drawChrome(ctx, win, scene.title || 'Recording');

  // URL pill in the title bar (browser feel without the mock tabs)
  if (scene.url) {
    const fs = Math.round(H / 62);
    ctx.font = `${fs}px ${MONO}`;
    const tw = ctx.measureText(scene.url).width;
    const pw = Math.min(tw + 40, win.w * 0.5);
    const px = win.x + win.w / 2 - pw / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    roundRect(ctx, px, win.y + 8, pw, TITLE_H - 16, 9);
    ctx.fill();
    ctx.fillStyle = C.dim;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(scene.url, win.x + win.w / 2, win.y + TITLE_H / 2 + 1, pw - 24);
    ctx.textAlign = 'left';
  }

  const content: Rect = { x: win.x + 2, y: win.y + TITLE_H, w: win.w - 4, h: win.h - TITLE_H - 2 };
  ctx.save();
  roundRect(ctx, win.x, win.y, win.w, win.h, 18);
  ctx.clip();

  if (video && video.readyState >= 2) {
    // live preview drift-correct (exports seek precisely via syncSceneVideos)
    const target = Math.min(local + (scene.clipStart ?? 0), Math.max(video.duration - 0.05, 0));
    if (Math.abs(video.currentTime - target) > 0.08 && !video.seeking) {
      try { video.currentTime = target; } catch {}
    }
    // cover-fit the clip into the content area
    const vw = video.videoWidth || 16, vh = video.videoHeight || 9;
    const scale = Math.max(content.w / vw, content.h / vh);
    const dw = vw * scale, dh = vh * scale;
    ctx.drawImage(video, content.x + (content.w - dw) / 2, content.y + (content.h - dh) / 2, dw, dh);
  } else {
    // slate: headless renders and missing clips stay presentable
    ctx.fillStyle = '#0e0e14';
    ctx.fillRect(content.x, content.y, content.w, content.h);
    const fs = Math.round(H / 40);
    ctx.font = `500 ${fs}px ${MONO}`;
    ctx.fillStyle = C.dim;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('▶ browser recording', content.x + content.w / 2, content.y + content.h / 2 - fs);
    ctx.font = `${Math.round(fs * 0.72)}px ${MONO}`;
    ctx.fillStyle = C.faint;
    ctx.fillText(scene.src || 'no clip', content.x + content.w / 2, content.y + content.h / 2 + fs * 0.6);
    ctx.textAlign = 'left';
  }
  ctx.restore();
  ctx.restore();
}

// ── Card enter transitions ──────────────────────────────────────────────────────
function drawCardTransition(
  ctx: CanvasRenderingContext2D,
  card: ReturnType<typeof activeCard>,
  time: number,
  W: number,
  H: number,
) {
  if (!card || !('transition' in card) || !card.transition || card.transition === 'none') return;
  const local = time - card.startTime;
  if (local > 0.55) return;
  const p = easeOutCubic(clamp(local / 0.45, 0, 1));
  const inv = 1 - p;
  if (card.transition === 'fade') {
    ctx.fillStyle = `rgba(0,0,0,${inv * 0.85})`;
    ctx.fillRect(0, 0, W, H);
  } else if (card.transition === 'slide' || card.transition === 'push') {
    ctx.fillStyle = `rgba(0,0,0,${inv * 0.5})`;
    ctx.fillRect(0, 0, W * inv, H);
  } else if (card.transition === 'zoom') {
    ctx.fillStyle = `rgba(0,0,0,${inv * 0.7})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// ── Composite layout card ───────────────────────────────────────────────────────
function layoutPresetRects(preset: string | undefined, count: number): { x: number; y: number; w: number; h: number }[] {
  if (preset === 'ide-only' || count <= 1) return [{ x: 0.02, y: 0.02, w: 0.96, h: 0.96 }];
  if (preset === 'ide-cli') {
    return [
      { x: 0.02, y: 0.02, w: 0.96, h: 0.62 },
      { x: 0.02, y: 0.66, w: 0.96, h: 0.32 },
    ];
  }
  // ide-browser / cli-browser / custom default: side by side
  return [
    { x: 0.02, y: 0.02, w: 0.48, h: 0.96 },
    { x: 0.52, y: 0.02, w: 0.46, h: 0.96 },
  ];
}

function layoutFocus(scene: LayoutScene, W: number, H: number): FocusTarget | null {
  const presets = layoutPresetRects(scene.preset, scene.regions.length);
  const fi = clamp(scene.focus ?? 0, 0, Math.max(0, scene.regions.length - 1));
  const r = scene.regions[fi]?.rect || presets[fi] || presets[0];
  const M = Math.round(W * 0.04);
  const win = { x: M, y: Math.round(H * 0.05), w: W - 2 * M, h: H - Math.round(H * 0.12) };
  return {
    x: win.x + r.x * win.w + (r.w * win.w) / 2,
    y: win.y + r.y * win.h + (r.h * win.h) / 2,
    zoom: 1.08,
    strength: 0.7,
  };
}

function drawLayoutCard(
  ctx: CanvasRenderingContext2D,
  prep: Prepared,
  scene: LayoutScene,
  time: number,
  W: number,
  H: number,
) {
  const a = cardAlpha(scene, time);
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  const M = Math.round(W * 0.04);
  const win: Rect = { x: M, y: Math.round(H * 0.05), w: W - 2 * M, h: H - Math.round(H * 0.12) };
  const presets = layoutPresetRects(scene.preset, scene.regions.length);
  const gap = 8;

  scene.regions.forEach((region, i) => {
    const nr = region.rect || presets[i] || presets[0];
    const pane: Rect = {
      x: win.x + nr.x * win.w + gap / 2,
      y: win.y + nr.y * win.h + gap / 2,
      w: nr.w * win.w - gap,
      h: nr.h * win.h - gap,
    };
    ctx.save();
    ctx.beginPath();
    ctx.rect(pane.x, pane.y, pane.w, pane.h);
    ctx.clip();

    if (region.type === 'ide') {
      const ideScene: IdeScene = {
        type: 'ide',
        startTime: scene.startTime,
        duration: scene.duration,
        narrationDuration: scene.narrationDuration,
        project: region.project,
        files: region.files || [],
        steps: region.steps || [],
      };
      // Scale drawIdeCard into pane by temporarily drawing at full size clipped — use a simplified pane IDE
      drawIdePane(ctx, prep, ideScene, time, pane);
    } else if (region.type === 'browser') {
      const th = pageThemeFrom({ pageTheme: region.pageTheme, theme: region.pageTheme });
      const { pageTop } = drawBrowserChrome(
        ctx,
        pane,
        region.url || 'localhost:3000',
        region.title || 'Preview',
        th,
        1,
      );
      const pageRect: Rect = { x: pane.x, y: pageTop, w: pane.w, h: pane.y + pane.h - pageTop };
      const blocks = region.blocks || [];
      const local = time - scene.startTime;
      const window = Math.min(scene.narrationDuration ?? scene.duration, scene.duration);
      const start = 0.4;
      const per = Math.max((window - start - 0.3) / Math.max(blocks.length, 1), 0.35);
      const shown = clamp(Math.floor((local - start) / per) + 1, 0, blocks.length);
      const frac = clamp((local - start) / per - (shown - 1), 0, 1);
      drawPageBlocks(ctx, blocks, pageRect, shown, frac, th, Math.round(H / 52));
    } else if (region.type === 'cli') {
      const cliScene: CliScene = {
        type: 'cli',
        startTime: scene.startTime,
        duration: scene.duration,
        narrationDuration: scene.narrationDuration,
        title: region.title,
        cwd: region.cwd,
        commands: region.commands || [],
      };
      drawCliPane(ctx, cliScene, time, pane, H);
    }
    ctx.restore();
  });
  ctx.restore();
}



