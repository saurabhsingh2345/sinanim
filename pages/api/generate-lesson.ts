import type { NextApiRequest, NextApiResponse } from 'next';
import { generateLessonDSL } from '@/lib/course';
import { AnimationDSL } from '@/lib/types';

type Data = { dsl: AnimationDSL } | { error: string };

export const config = {
  api: { responseLimit: false },
  maxDuration: 300,
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Data>,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { outline, lessonId, model, reviewConcepts } = req.body || {};
  if (!outline || !Array.isArray(outline.modules)) {
    return res.status(400).json({ error: 'A course "outline" is required' });
  }
  if (!lessonId || typeof lessonId !== 'string') {
    return res.status(400).json({ error: 'A "lessonId" is required' });
  }

  try {
    const dsl = await generateLessonDSL(outline, lessonId, {
      model: typeof model === 'string' && model ? model : undefined,
      reviewConcepts: Array.isArray(reviewConcepts)
        ? reviewConcepts.filter((c) => typeof c === 'string').slice(0, 5)
        : undefined,
    });
    return res.status(200).json({ dsl });
  } catch (err) {
    console.error('generate-lesson error:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to generate the lesson',
    });
  }
}
