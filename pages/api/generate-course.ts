import type { NextApiRequest, NextApiResponse } from 'next';
import { CourseOutline, generateCourseOutline } from '@/lib/course';

type Data = { outline: CourseOutline } | { error: string };

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

  const { prompt, model } = req.body || {};
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'A non-empty "prompt" is required' });
  }

  try {
    const outline = await generateCourseOutline(prompt.trim(), {
      model: typeof model === 'string' && model ? model : undefined,
    });
    return res.status(200).json({ outline });
  } catch (err) {
    console.error('generate-course error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to design the course',
    });
  }
}
