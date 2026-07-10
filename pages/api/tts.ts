// Premium voice tiers, proxied server-side so keys never reach the browser.
//
// Kokoro (local, free) stays the default. When a key is configured, the
// player's voice menu grows premium options:
//   OPENAI_API_KEY      → gpt-4o-mini-tts   (~$0.015/min, style instructions)
//   ELEVENLABS_API_KEY  → eleven_multilingual (quality ceiling)
// Voice ids are namespaced: "oa:<voice>" and "el:<voiceId>". GET lists what's
// available; POST synthesizes one sentence and returns MP3 bytes.

import type { NextApiRequest, NextApiResponse } from 'next';

const OA_VOICES = ['alloy', 'ash', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'];
const OA_STYLE =
  'Warm, sharp coding tutor. Conversational and energetic, never announcer-like. ' +
  'Brief natural pauses at commas and periods; emphasize words in quotes.';

export const config = { api: { responseLimit: '8mb' } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const voices: { id: string; label: string }[] = [];
    if (process.env.OPENAI_API_KEY) {
      voices.push(
        { id: 'oa:nova', label: 'Nova · OpenAI (premium)' },
        { id: 'oa:onyx', label: 'Onyx · OpenAI (premium)' },
        { id: 'oa:coral', label: 'Coral · OpenAI (premium)' },
      );
    }
    if (process.env.ELEVENLABS_API_KEY) {
      voices.push({ id: 'el:21m00Tcm4TlvDq8ikWAM', label: 'Rachel · ElevenLabs (premium)' });
    }
    res.status(200).json({ voices });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'GET or POST' });
    return;
  }

  const { text, voice } = req.body ?? {};
  if (typeof text !== 'string' || !text.trim() || typeof voice !== 'string') {
    res.status(400).json({ error: 'text and voice required' });
    return;
  }
  const clipped = text.slice(0, 600); // sentence-level calls only

  try {
    let audio: ArrayBuffer;
    if (voice.startsWith('oa:')) {
      const key = process.env.OPENAI_API_KEY;
      if (!key) throw new Error('OPENAI_API_KEY not configured');
      const id = OA_VOICES.includes(voice.slice(3)) ? voice.slice(3) : 'nova';
      const r = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini-tts',
          voice: id,
          input: clipped,
          instructions: OA_STYLE,
          response_format: 'mp3',
        }),
      });
      if (!r.ok) throw new Error(`OpenAI TTS ${r.status}: ${(await r.text()).slice(0, 300)}`);
      audio = await r.arrayBuffer();
    } else if (voice.startsWith('el:')) {
      const key = process.env.ELEVENLABS_API_KEY;
      if (!key) throw new Error('ELEVENLABS_API_KEY not configured');
      const r = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice.slice(3))}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'xi-api-key': key },
          body: JSON.stringify({ text: clipped, model_id: 'eleven_multilingual_v2' }),
        },
      );
      if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 300)}`);
      audio = await r.arrayBuffer();
    } else {
      res.status(400).json({ error: `unknown voice tier: ${voice}` });
      return;
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(Buffer.from(audio));
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'tts failed' });
  }
}
