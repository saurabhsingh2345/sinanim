// Real browser capture — deterministic screen recording of an actual web page.
//
// The canvas `browser` scene is a mockup; this produces the real thing: a
// headless Chromium drives a real page (typing, clicking, scrolling, with a
// visible human-motion cursor) and captures it frame by frame under a FAKE
// clock, so the output is a buttery, perfectly-timed 60fps clip regardless of
// machine speed — never a dropped frame, same file every run.
//
//   npx tsx scripts/capture-browser.mts spec.json out.mp4
//
// Spec (JSON):
// {
//   "url": "https://example.com",        // or "html": "<h1>inline page</h1>"
//   "width": 1920, "height": 1080, "fps": 60, "duration": 8,
//   "cursor": true,
//   "steps": [
//     { "at": 0.5, "kind": "move",   "selector": "#search" },
//     { "at": 1.0, "kind": "click",  "selector": "#search" },
//     { "at": 1.3, "kind": "type",   "selector": "#search", "text": "flask tutorial", "cps": 14 },
//     { "at": 4.0, "kind": "scroll", "y": 600, "seconds": 1.2 },
//     { "at": 6.0, "kind": "click",  "selector": "a.result" }
//   ]
// }
//
// Techniques (see MASTERPLAN Pillar C): Playwright's page.clock fakes
// Date/timers/rAF so JS-driven motion is stepped exactly one frame at a time;
// the cursor is an injected DOM element eased along a curved path (with a
// click ripple); frames pipe straight into ffmpeg → H.264 MP4.

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium, Page } from 'playwright';

interface CaptureStep {
  at: number;
  kind: 'move' | 'click' | 'type' | 'scroll' | 'hover' | 'goto';
  selector?: string;
  text?: string;
  /** Characters per second for "type" (default 14, human-ish). */
  cps?: number;
  /** Target scrollY for "scroll". */
  y?: number;
  /** Seconds the scroll glide takes (default 1). */
  seconds?: number;
  url?: string;
}

interface CaptureSpec {
  url?: string;
  html?: string;
  width?: number;
  height?: number;
  fps?: number;
  duration: number;
  cursor?: boolean;
  deviceScaleFactor?: number;
  steps: CaptureStep[];
}

// ── Injected cursor + smooth scroll driver (runs inside the page) ───────────────
const DRIVER = `
(() => {
  const cur = document.createElement('div');
  cur.id = '__cap_cursor';
  cur.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;' +
    'pointer-events:none;transition:none;transform:translate(-4px,-2px);';
  cur.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2 L20 12 L12.5 13.5 L16 21 L13.4 22 L10 14.5 L4 19 Z" fill="#fff" stroke="#111" stroke-width="1.4"/></svg>';
  document.body.appendChild(cur);
  let px = innerWidth * 0.7, py = innerHeight * 0.85;      // enters from lower right
  let sx = px, sy = py, tx = px, ty = py, t0 = 0, t1 = 0;
  const ease = (p) => 1 - Math.pow(1 - p, 3);
  window.__capMoveTo = (x, y, now, dur) => { sx = px; sy = py; tx = x; ty = y; t0 = now; t1 = now + dur; };
  window.__capTick = (now) => {
    if (t1 > t0) {
      const p = Math.min(1, (now - t0) / (t1 - t0));
      const e = ease(p);
      // slight curve: perpendicular bulge that dies out — human, not laser
      const mx = sx + (tx - sx) * e, my = sy + (ty - sy) * e;
      const bulge = Math.sin(p * Math.PI) * Math.min(60, Math.hypot(tx - sx, ty - sy) * 0.12);
      const ang = Math.atan2(ty - sy, tx - sx) + Math.PI / 2;
      px = mx + Math.cos(ang) * bulge; py = my + Math.sin(ang) * bulge;
    }
    cur.style.left = px + 'px'; cur.style.top = py + 'px';
  };
  window.__capRipple = (x, y) => {
    const r = document.createElement('div');
    r.style.cssText = 'position:fixed;left:'+(x-18)+'px;top:'+(y-18)+'px;width:36px;height:36px;' +
      'border-radius:50%;border:2.5px solid rgba(99,102,241,.85);z-index:2147483646;pointer-events:none;' +
      'animation:__capRip .5s ease-out forwards;';
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 600);
  };
  const st = document.createElement('style');
  st.textContent = '@keyframes __capRip{from{transform:scale(.4);opacity:1}to{transform:scale(1.6);opacity:0}}';
  document.head.appendChild(st);
  // smooth scroll glide
  let scFrom = 0, scTo = 0, sct0 = 0, sct1 = 0;
  window.__capScrollTo = (y, now, dur) => { scFrom = scrollY; scTo = y; sct0 = now; sct1 = now + dur; };
  window.__capScrollTick = (now) => {
    if (sct1 > sct0 && now <= sct1 + 32) {
      const p = Math.min(1, (now - sct0) / (sct1 - sct0));
      scrollTo(0, scFrom + (scTo - scFrom) * (1 - Math.pow(1 - p, 3)));
    }
  };
})();`;

async function centerOf(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`selector not found: ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function main() {
  const [specPath, outPath = 'capture.mp4'] = process.argv.slice(2);
  if (!specPath) {
    console.error('usage: npx tsx scripts/capture-browser.mts spec.json out.mp4');
    process.exit(1);
  }
  const spec: CaptureSpec = JSON.parse(readFileSync(specPath, 'utf8'));
  const W = spec.width ?? 1920;
  const H = spec.height ?? 1080;
  const fps = spec.fps ?? 60;
  const totalFrames = Math.ceil(spec.duration * fps);

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: spec.deviceScaleFactor ?? 1,
  });

  // fake clock BEFORE load so the page's own JS runs on virtual time
  await page.clock.install({ time: new Date('2026-01-01T10:00:00') });
  if (spec.html) await page.setContent(spec.html, { waitUntil: 'networkidle' });
  else if (spec.url) await page.goto(spec.url, { waitUntil: 'networkidle' });
  else throw new Error('spec needs "url" or "html"');
  if (spec.cursor !== false) await page.evaluate(DRIVER);

  // resolve steps into per-frame actions (virtual-time schedule)
  const steps = [...spec.steps].sort((a, b) => a.at - b.at);
  let stepIdx = 0;

  // ffmpeg: PNG frames on stdin → H.264
  const ff = spawn('ffmpeg', [
    '-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outPath,
  ], { stdio: ['pipe', 'ignore', 'inherit'] });
  const ffDone = new Promise<void>((res, rej) => {
    ff.on('close', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited ${code}`))));
  });

  const frameMs = 1000 / fps;
  for (let i = 0; i < totalFrames; i++) {
    const tSec = i / fps;
    const nowMs = i * frameMs;

    // fire any steps scheduled inside this frame
    while (stepIdx < steps.length && steps[stepIdx].at <= tSec + 1e-9) {
      const st = steps[stepIdx++];
      if (st.kind === 'goto' && st.url) {
        await page.goto(st.url, { waitUntil: 'networkidle' });
        if (spec.cursor !== false) await page.evaluate(DRIVER);
      } else if ((st.kind === 'move' || st.kind === 'hover' || st.kind === 'click') && st.selector) {
        const { x, y } = await centerOf(page, st.selector);
        // glide the cursor there over ~0.45s, then act
        await page.evaluate(
          ([x2, y2, now]) => (window as any).__capMoveTo?.(x2, y2, now, 450),
          [x, y, nowMs] as const,
        );
        if (st.kind === 'click') {
          // schedule the actual click for when the cursor lands (next frames)
          steps.splice(stepIdx, 0, { at: tSec + 0.5, kind: '__do_click' as any, selector: st.selector });
        }
        if (st.kind === 'hover') await page.locator(st.selector).first().hover();
      } else if ((st.kind as string) === '__do_click' && st.selector) {
        const { x, y } = await centerOf(page, st.selector);
        await page.evaluate(([x2, y2]) => (window as any).__capRipple?.(x2, y2), [x, y] as const);
        await page.locator(st.selector).first().click({ force: true });
      } else if (st.kind === 'type' && st.selector && st.text) {
        // human typing: cumulative jittered keystroke times (always monotonic)
        const cps = st.cps ?? 14;
        await page.locator(st.selector).first().click({ force: true });
        let keyAt = tSec;
        for (let k = 0; k < st.text.length; k++) {
          const jitter = 0.6 + ((k * 2654435761) % 100) / 125; // deterministic 0.6..1.4
          keyAt += jitter / cps;
          steps.splice(
            stepIdx, 0,
            { at: keyAt, kind: '__do_key' as any, selector: st.selector, text: st.text[k] },
          );
        }
        steps.sort((a, b) => a.at - b.at);
      } else if ((st.kind as string) === '__do_key' && st.selector && st.text) {
        await page.locator(st.selector).first().pressSequentially(st.text, { delay: 0 });
      } else if (st.kind === 'scroll') {
        await page.evaluate(
          ([y, now, dur]) => (window as any).__capScrollTo?.(y, now, dur),
          [st.y ?? 400, nowMs, (st.seconds ?? 1) * 1000] as const,
        );
      }
    }

    // advance cursor/scroll drivers, then step virtual time exactly one frame
    if (spec.cursor !== false) {
      await page.evaluate((now) => {
        (window as any).__capTick?.(now);
        (window as any).__capScrollTick?.(now);
      }, nowMs);
    }
    await page.clock.runFor(frameMs);

    const png = await page.screenshot({ type: 'png' });
    await new Promise<void>((res, rej) =>
      ff.stdin.write(png, (e) => (e ? rej(e) : res())),
    );
    if (i % fps === 0) process.stdout.write(`\rframe ${i}/${totalFrames}`);
  }
  process.stdout.write(`\rframe ${totalFrames}/${totalFrames}\n`);

  ff.stdin.end();
  await ffDone;
  await browser.close();
  console.log(`wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
