import type { NextApiRequest, NextApiResponse } from 'next';
import { generateWhiteboard } from '@/lib/llm';
import { AnimationDSL } from '@/lib/types';

type Data = { dsl: AnimationDSL } | { error: string };

export const config = {
  api: { responseLimit: false },
  maxDuration: 120,
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, model, vision } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'A non-empty "prompt" is required' });
  }

  try {
    const dsl = await generateWhiteboard(prompt.trim(), {
      model: typeof model === 'string' && model ? model : undefined,
      ...(vision != null ? { vision: !!vision } : {}),
    } as any);
    return res.status(200).json({ dsl });
  } catch (err) {
    console.error('generate-whiteboard error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to generate whiteboard',
    });
  }
}
