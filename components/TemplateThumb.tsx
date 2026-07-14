// Live template previews for the maker home page: each card renders a REAL
// frame of its scaffold through the same renderFrame that plays lessons —
// what you see is literally what the template produces, not a mock image.
//
// Thumbs render one at a time through a tiny module queue (a burst of 13
// prepare() calls would jank the hero), and cache as data URLs for the
// session so re-visits are instant.
import React, { useEffect, useState } from 'react';
import { normalizeDSL, repace } from '@/lib/dsl';
import { prepare, renderFrame } from '@/lib/renderer';
import { AnimationDSL } from '@/lib/types';

const THUMB_W = 480;
const THUMB_H = 270;
const FULL_FRAME = new Set(['ide', 'cli', 'browser', 'split', 'api', 'pr', 'layout', 'viz', 'diagram', 'quiz', 'challenge', 'whiteboard']);

const cache = new Map<string, string>();
let queue: Promise<void> = Promise.resolve();

async function renderThumb(id: string, build: () => unknown): Promise<string | null> {
  const hit = cache.get(id);
  if (hit) return hit;
  try {
    // Force the bundled families to load before rendering — document.fonts.ready
    // alone can resolve before an unused @font-face has started loading, which
    // makes the canvas thumb render in a fallback font (the "stale preview" bug).
    const f: any = (document as any).fonts;
    if (f?.load) {
      await Promise.all([
        f.load('700 24px "Space Grotesk"'),
        f.load('500 16px "Inter"'),
        f.load('500 16px "JetBrains Mono"'),
      ].map((p) => p.catch(() => {})));
    }
    await f?.ready;
    const dsl: AnimationDSL = repace(normalizeDSL(build() as any));
    const prep = await prepare(dsl);
    // the flagship moment: the first full-frame scene, well into its steps
    const full = dsl.scenes.find((s) => FULL_FRAME.has(s.type));
    const t = full
      ? full.startTime + Math.max(full.duration * 0.6, Math.min(2, full.duration - 0.1))
      : dsl.duration * 0.35;
    const c = document.createElement('canvas');
    c.width = THUMB_W;
    c.height = THUMB_H;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.scale(THUMB_W / dsl.width, THUMB_H / dsl.height);
    renderFrame(ctx, prep, t);
    const url = c.toDataURL('image/webp', 0.82);
    cache.set(id, url);
    return url;
  } catch {
    return null; // thumbs are decorative — the card still works without one
  }
}

export function TemplateThumb({ id, build }: { id: string; build: () => unknown }) {
  const [url, setUrl] = useState<string | null>(cache.get(id) ?? null);
  useEffect(() => {
    if (url) return;
    let dead = false;
    queue = queue.then(async () => {
      if (dead) return;
      const u = await renderThumb(id, build);
      if (u && !dead) setUrl(u);
    });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return url
    ? <img className="thumb" src={url} alt="" draggable={false} />
    : <span className="thumb skeleton" aria-hidden />;
}
