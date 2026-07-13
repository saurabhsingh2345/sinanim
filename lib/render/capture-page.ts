// Real-page screenshots for the `browser` template. Instead of drawing a cartoon
// of a web page with ctx.fillText, we drive a headless Chromium (Playwright) to a
// live URL and screenshot it, then composite that PNG into the browser window.
//
// This runs server-side / at build time ONLY (Playwright needs a real browser).
// The capture pre-pass writes one PNG per browser scene and stamps `scene.shot`
// with its path; the renderer's prepare() loads it and drawBrowserCard draws it.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { AnimationDSL, BrowserScene } from '../types';

export interface ShotOptions {
  /** Viewport width for the capture (page is rendered at this CSS width). */
  width?: number;
  /** Viewport height. */
  height?: number;
  /** Navigation timeout (ms). */
  timeout?: number;
  /** Directory to write PNGs into. */
  cacheDir?: string;
}

/** Deterministic filename so repeated renders of the same URL reuse the capture. */
function shotName(url: string, w: number, h: number): string {
  const hash = createHash('sha1').update(`${url}@${w}x${h}`).digest('hex').slice(0, 12);
  return `browser-shot-${hash}.png`;
}

/**
 * Capture a real screenshot for every `browser` scene that has a `url` but no
 * `shot` yet, writing PNGs into `cacheDir` and stamping `scene.shot`. One
 * Chromium instance is reused across scenes. Fail-soft: a scene that can't be
 * captured keeps its mock blocks (scene.shot stays undefined).
 */
export async function ensureBrowserShots(dsl: AnimationDSL, opts: ShotOptions = {}): Promise<void> {
  const width = opts.width ?? 1366;
  const height = opts.height ?? 768;
  const timeout = opts.timeout ?? 30000;
  const cacheDir = opts.cacheDir ?? join(process.cwd(), '.cache', 'browser-shots');

  const targets = dsl.scenes
    .map((s, i) => [s, i] as const)
    .filter(([s]) => s.type === 'browser' && (s as BrowserScene).url && !(s as BrowserScene).shot)
    .map(([s, i]) => [s as BrowserScene, i] as const);
  if (!targets.length) return;

  mkdirSync(cacheDir, { recursive: true });

  let chromium: any;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.warn('[browser-shots] playwright not installed — browser scenes fall back to mock blocks');
    return;
  }

  let browser: any;
  try {
    browser = await chromium.launch();
  } catch (e) {
    console.warn('[browser-shots] could not launch Chromium — falling back to mock blocks:', (e as Error).message);
    return;
  }

  try {
    for (const [scene, i] of targets) {
      const file = join(cacheDir, shotName(scene.url, width, height));
      if (existsSync(file)) { scene.shot = file; continue; }
      try {
        const ctx = await browser.newContext({
          viewport: { width, height },
          deviceScaleFactor: 2,
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
        });
        const page = await ctx.newPage();
        await page.goto(scene.url, { waitUntil: 'networkidle', timeout }).catch(async () => {
          // networkidle can hang on chatty pages — fall back to domcontentloaded
          await page.goto(scene.url, { waitUntil: 'domcontentloaded', timeout });
        });
        // let fonts/hero images settle, dismiss obvious cookie dialogs is out of scope
        await page.waitForTimeout(600);
        const buf: Buffer = await page.screenshot({ type: 'png' });
        writeFileSync(file, buf);
        scene.shot = file;
        await ctx.close();
        console.log(`[browser-shots] captured ${scene.url} -> ${file}`);
      } catch (e) {
        console.warn(`[browser-shots] failed to capture ${scene.url}:`, (e as Error).message);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
}
