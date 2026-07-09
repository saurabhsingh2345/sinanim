import type { NextApiRequest, NextApiResponse } from 'next';
import { gradeChallenge, GradeResult } from '@/lib/grade';
import { ChallengeTest } from '@/lib/types';

// Grades a coding challenge: runs the learner's code against real tests.
type Data = GradeResult | { error: string };

export const config = { api: { responseLimit: false }, maxDuration: 60 };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { language, code, tests } = req.body || {};
  if (typeof code !== 'string' || !Array.isArray(tests) || !tests.length) {
    return res.status(400).json({ error: '"code" and non-empty "tests" are required' });
  }

  try {
    const clean: ChallengeTest[] = tests
      .filter((t: any) => t && typeof t.expression === 'string')
      .map((t: any) => ({ expression: String(t.expression), expected: String(t.expected ?? '') }))
      .slice(0, 8);
    const result = await gradeChallenge(String(language || 'python'), code, clean);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'grading failed' });
  }
}
