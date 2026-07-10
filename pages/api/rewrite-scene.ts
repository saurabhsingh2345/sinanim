import type { NextApiRequest, NextApiResponse } from 'next';
import { chatJSON } from '@/lib/llm';
import { extractJSON, normalizeDSL } from '@/lib/dsl';
import { AnimationDSL, Scene } from '@/lib/types';

type Data = { scene: Scene } | { error: string };

export const config = {
  api: { responseLimit: false },
  maxDuration: 120,
};

const REWRITE_SYSTEM = `You rewrite ONE scene in a narrated coding-lesson timeline (AnimationDSL).
Return ONLY a single JSON scene object of the same "type" — no markdown, no wrapper.
Keep startTime and duration roughly the same unless the instruction needs more room.
Preserve correct, runnable code. Prefer ide/viz/quiz teaching quality.
Narration: 2–5 spoken sentences, plain speech, no code symbols.`;

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { scene, instruction, lessonTitle, model } = req.body || {};
  if (!scene || typeof scene !== 'object' || !scene.type) {
    return res.status(400).json({ error: '"scene" object with a type is required' });
  }
  if (!instruction || typeof instruction !== 'string' || !instruction.trim()) {
    return res.status(400).json({ error: 'A non-empty "instruction" is required' });
  }

  try {
    const user = [
      lessonTitle ? `Lesson title: ${lessonTitle}` : '',
      `Instruction: ${instruction.trim()}`,
      `Current scene JSON:`,
      JSON.stringify(scene),
      `Return the updated scene JSON only.`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const content = await chatJSON(REWRITE_SYSTEM, user, {
      model: typeof model === 'string' && model ? model : undefined,
    });
    const parsed = JSON.parse(extractJSON(content));
    // Normalize via a tiny DSL so we get the same defaults as full lessons.
    const stub: AnimationDSL = {
      title: typeof lessonTitle === 'string' ? lessonTitle : 'Lesson',
      duration: Number(scene.duration) || 8,
      fps: 30,
      width: 1920,
      height: 1080,
      backgroundColor: '#0b0b10',
      scenes: [parsed],
    };
    const normalized = normalizeDSL(stub);
    const out = normalized.scenes[0];
    if (!out || out.type !== scene.type) {
      // Accept type changes only if the model clearly intended them; otherwise keep type.
      if (!out) throw new Error('Model returned no scene');
    }
    // Preserve timing anchors from the original beat.
    out.startTime = Number(scene.startTime) || out.startTime;
    if (scene.duration && !instruction.toLowerCase().includes('longer')) {
      out.duration = Number(scene.duration) || out.duration;
    }
    return res.status(200).json({ scene: out });
  } catch (err) {
    console.error('rewrite-scene error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to rewrite scene',
    });
  }
}
