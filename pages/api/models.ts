import type { NextApiRequest, NextApiResponse } from 'next';
import { getProviderStatus } from '@/lib/llm';

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse,
) {
  const status = await getProviderStatus();
  res.status(200).json(status);
}
