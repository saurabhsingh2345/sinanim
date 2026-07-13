// Vision QA — a VLM looks at rendered keyframes and critiques what a text
// judge can't see: overlap, cut-off text, dead space, illegible contrast.
//
// Pattern from the slide-generation literature (PPTAgent / PreGenie): render a
// few keyframes per lesson, hand them to a vision model with a BINARY
// checklist, and surface the failures as QA notes. Frames are rendered
// server-side with @napi-rs/canvas — the same deterministic renderFrame that
// drives preview and export, so what the critic sees is what ships.
//
// Node-only and fail-soft: opt in with LLM_VISION_QA=1; any missing piece
// (no canvas binding, provider without vision) silently returns no notes.

import { AnimationDSL, PRIMARY_CARD_TYPES } from '../types';

const CHECKS = [
  'text_cut_off: any text is clipped by a panel edge or the frame',
  'overlap: two elements collide or overlap illegibly',
  'dead_space: more than ~50% of the frame is empty while content is crammed elsewhere',
  'contrast: any text is hard to read against its background',
  'overflow: code/terminal content runs outside its window',
];

const VISION_PROMPT = `You are reviewing frames of an animated coding lesson for VISUAL defects only
(not content). For each image, check this list and return JSON only:
{ "frames": [ { "index": number, "issues": [ "<check_id>: what and where, one line" ] } ] }
Checks (report ONLY clear failures — an empty issues array is the normal, expected answer):
${CHECKS.map((c) => `- ${c}`).join('\n')}`;

interface Keyframe { sceneIndex: number; type: string; time: number; }

/** Pick the moments worth looking at: mid-flight of each primary card, tagged
 *  with the scene they belong to so a defect maps back to a fixable scene. */
function keyframes(dsl: AnimationDSL, max = 4): Keyframe[] {
  const out: Keyframe[] = [];
  dsl.scenes.forEach((s, i) => {
    if (out.length >= max || !PRIMARY_CARD_TYPES.has(s.type)) return;
    out.push({ sceneIndex: i, type: s.type, time: s.startTime + s.duration * 0.6 });
  });
  return out;
}

/** Register the bundled fonts the renderer actually uses so the critic sees the
 *  SAME frame that ships (not a Menlo-only fallback). Falls back to system mono. */
async function registerFonts() {
  const { GlobalFonts } = await import('@napi-rs/canvas');
  const { existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const dir = join(process.cwd(), 'public', 'fonts');
  const bundled: [string, string][] = [
    ['JetBrainsMono.ttf', 'JetBrains Mono'],
    ['Inter.ttf', 'Inter'],
    ['SpaceGrotesk.ttf', 'Space Grotesk'],
  ];
  let anyMono = false;
  for (const [file, family] of bundled) {
    const p = join(dir, file);
    if (existsSync(p)) { try { GlobalFonts.registerFromPath(p, family); if (family === 'JetBrains Mono') anyMono = true; } catch {} }
  }
  if (!anyMono) for (const p of ['/System/Library/Fonts/Menlo.ttc', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf']) {
    if (existsSync(p)) { try { GlobalFonts.registerFromPath(p, 'JetBrains Mono'); break; } catch {} }
  }
}

/** Render keyframes headlessly → JPEG data URLs (small: the critic doesn't need 1080p). */
async function renderKeyframes(dsl: AnimationDSL, kfs: Keyframe[]): Promise<string[]> {
  const { createCanvas } = await import('@napi-rs/canvas');
  await registerFonts();
  const { prepare, renderFrame } = await import('../renderer');
  const prep = await prepare(dsl);
  const scale = 640 / dsl.width;
  const canvas = createCanvas(640, Math.round(dsl.height * scale));
  const ctx = canvas.getContext('2d');
  const out: string[] = [];
  for (const kf of kfs) {
    ctx.save();
    ctx.scale(scale, scale);
    renderFrame(ctx as unknown as CanvasRenderingContext2D, prep, kf.time);
    ctx.restore();
    out.push(`data:image/jpeg;base64,${canvas.toBuffer('image/jpeg', 78).toString('base64')}`);
  }
  return out;
}

/** One multimodal round-trip (OpenAI-compatible content parts). */
async function critiqueFrames(images: string[], kfs: Keyframe[]): Promise<string[]> {
  const provider = process.env.GROQ_API_KEY ? 'groq' : process.env.OPENAI_API_KEY ? 'openai' : null;
  if (!provider) return [];
  const base = provider === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1';
  const key = provider === 'groq' ? process.env.GROQ_API_KEY : process.env.OPENAI_API_KEY;
  const model =
    process.env.LLM_VISION_MODEL ||
    (provider === 'groq' ? 'meta-llama/llama-4-scout-17b-16e-instruct' : 'gpt-4o');

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: VISION_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Review these ${images.length} keyframes.` },
            ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
          ],
        },
      ],
    }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const notes: string[] = [];
    for (const f of parsed?.frames ?? []) {
      const kf = kfs[Number(f.index)];
      const ref = kf ? `Scene ${kf.sceneIndex + 1} (${kf.type})` : `Keyframe ${Number(f.index) + 1}`;
      for (const issue of f?.issues ?? []) {
        notes.push(`${ref}: ${String(issue)}`);
      }
    }
    return notes.slice(0, 10);
  } catch {
    return [];
  }
}

/** Render → critique. Returns visual-defect notes, each tagged with the scene it
 *  refers to ([] = clean or unavailable). Notes are the closed-loop repair input. */
export async function visionQA(dsl: AnimationDSL): Promise<string[]> {
  if (typeof window !== 'undefined') return [];
  try {
    const kfs = keyframes(dsl);
    if (!kfs.length) return [];
    const images = await renderKeyframes(dsl, kfs);
    return await critiqueFrames(images, kfs);
  } catch {
    return [];
  }
}
