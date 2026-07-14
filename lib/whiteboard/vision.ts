// Whiteboard vision self-critique: render several moments of a generated board,
// hand them to a vision model with a LAYOUT checklist, and return the defects so
// the blueprint can be auto-fixed. This is the engine's "eyes" — it catches what
// text reasoning can't: overlap, off-frame, stale clutter, placeholder icons,
// wrong motion direction. Node-only, fail-soft. Reuses the deterministic
// renderFrame so the critic sees exactly what ships.
import { AnimationDSL } from '../types';

const WB_CHECKS = [
  'overlap: two icons/labels, or an icon and text, touch or sit on top of each other',
  'offscreen: an element is cut off or outside the frame edges (keep content within ~8%..92%)',
  'stale: earlier content was not cleared and new content is drawn over it (clutter)',
  'placeholder: a plain empty SQUARE BOX appears instead of a real drawn icon (icon did not resolve)',
  'dead_space: most of the board is empty while everything is crammed into one corner',
  'wrong_direction: motion goes the wrong way (e.g. something described as falling moves up or sideways)',
];

const WB_VISION_PROMPT = `You review frames of a hand-drawn WHITEBOARD animation for VISUAL/LAYOUT defects ONLY (not the teaching content). The frames are in time order — later frames should stay clean, not pile drawings on top of earlier ones. Return JSON only:
{ "issues": [ "<check_id>: what and where, one short line" ] }
Report ONLY clear, real failures. An empty array is the normal, expected answer.
Checks:
${WB_CHECKS.map((c) => `- ${c}`).join('\n')}`;

async function registerFonts() {
  const { GlobalFonts } = await import('@napi-rs/canvas');
  const { existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const dir = join(process.cwd(), 'public', 'fonts');
  const fonts: [string, string][] = [['Caveat.ttf', 'Caveat'], ['Inter.ttf', 'Inter'], ['SpaceGrotesk.ttf', 'Space Grotesk']];
  for (const [file, family] of fonts) {
    const p = join(dir, file);
    if (existsSync(p)) { try { GlobalFonts.registerFromPath(p, family); } catch {} }
  }
}

async function renderTimes(dsl: AnimationDSL, times: number[]): Promise<string[]> {
  const { createCanvas } = await import('@napi-rs/canvas');
  await registerFonts();
  const { prepare, renderFrame } = await import('../renderer');
  const prep = await prepare(dsl);
  const scale = 720 / dsl.width;
  const canvas = createCanvas(720, Math.round(dsl.height * scale));
  const ctx = canvas.getContext('2d');
  const out: string[] = [];
  for (const t of times) {
    ctx.save();
    ctx.scale(scale, scale);
    renderFrame(ctx as unknown as CanvasRenderingContext2D, prep, t);
    ctx.restore();
    out.push(`data:image/jpeg;base64,${canvas.toBuffer('image/jpeg', 80).toString('base64')}`);
  }
  return out;
}

async function critique(images: string[]): Promise<string[]> {
  const provider = process.env.GROQ_API_KEY ? 'groq' : process.env.OPENAI_API_KEY ? 'openai' : null;
  if (!provider) return [];
  const base = provider === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1';
  const key = provider === 'groq' ? process.env.GROQ_API_KEY : process.env.OPENAI_API_KEY;
  const model = process.env.LLM_VISION_MODEL || (provider === 'groq' ? 'meta-llama/llama-4-scout-17b-16e-instruct' : 'gpt-4o');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model, temperature: 0, response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: WB_VISION_PROMPT },
        { role: 'user', content: [
          { type: 'text', text: `Review these ${images.length} whiteboard frames, in time order.` },
          ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
        ] },
      ],
    }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (!raw) return [];
  try { return (JSON.parse(raw)?.issues ?? []).map(String).slice(0, 12); } catch { return []; }
}

/** Render key moments of a whiteboard scene and return visual-defect notes
 *  ([] = clean or unavailable). The closed-loop repair input. */
export async function whiteboardVisionQA(dsl: AnimationDSL): Promise<string[]> {
  if (typeof window !== 'undefined') return [];
  try {
    const sc = dsl.scenes.find((s) => s.type === 'whiteboard');
    if (!sc) return [];
    const times = [0.28, 0.48, 0.66, 0.82, 0.96].map((f) => sc.startTime + sc.duration * f);
    return await critique(await renderTimes(dsl, times));
  } catch {
    return [];
  }
}
