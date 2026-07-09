import type { NextApiRequest, NextApiResponse } from 'next';
import { chatJSON } from '@/lib/llm';
import { extractJSON } from '@/lib/dsl';

// LEAP 2 — the lesson reacts to the learner's OWN code. When they edit and run
// code in the playground, Bit responds to what THEY specifically wrote and the
// real output — praise a genuine improvement, explain their actual error, or
// nudge them to experiment. This is what turns a video into a tutor.

const ACTIONS = ['celebrate', 'point', 'think', 'shocked', 'wave'];
const TONES = ['praise', 'nudge', 'fix'];

const SYSTEM = `You are Bit, a warm, sharp coding tutor mascot reacting in real time to a learner
who just edited and ran code inside a lesson's playground. Return JSON ONLY:
{ "message": "1-2 short SPOKEN sentences", "action": "celebrate|point|think|shocked|wave", "tone": "praise|nudge|fix" }

You are shown: the concept being taught, the ORIGINAL starter code, the learner's EDITED code, and the
REAL output (or error) from running it.

React like a great tutor looking over their shoulder:
- Be SPECIFIC to what they actually changed or what their output shows — never generic.
- If the output is an ERROR: be encouraging, name the cause in plain language, and say how to fix it. action "shocked" or "think", tone "fix".
- If they genuinely improved or made something new work: celebrate that specific thing. action "celebrate", tone "praise".
- If they ran it unchanged or barely touched it: gently nudge them to try one concrete experiment. action "point", tone "nudge".
- Speak like a person. No code blocks, no markdown. Under 40 words. Never invent output they didn't get.`;

type Data = { message: string; action: string; tone: string } | { error: string };

export const config = { api: { responseLimit: false }, maxDuration: 60 };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Data>) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { concept, starterCode, learnerCode, output, language, model } = req.body || {};
  if (typeof learnerCode !== 'string' || !learnerCode.trim()) {
    return res.status(400).json({ error: '"learnerCode" is required' });
  }

  const changed = String(starterCode || '').trim() !== learnerCode.trim();
  const user = [
    `Concept being taught: ${concept || 'a coding idea'} (${language || 'code'}).`,
    `Original starter code:\n${starterCode || '(none)'}`,
    `Learner's edited code:\n${learnerCode}`,
    `They ${changed ? 'CHANGED the code' : 'ran it essentially UNCHANGED'}.`,
    `Real output when run:\n${(output || '(no output)').slice(0, 1500)}`,
    `React now.`,
  ].join('\n\n');

  try {
    const raw = await chatJSON(SYSTEM, user, {
      model: typeof model === 'string' && model ? model : undefined,
    });
    const parsed = JSON.parse(extractJSON(raw));
    const action = ACTIONS.includes(parsed.action) ? parsed.action : 'point';
    const tone = TONES.includes(parsed.tone) ? parsed.tone : 'nudge';
    const message = String(parsed.message || '').slice(0, 240) || 'Give it a try — tweak something and run again!';
    return res.status(200).json({ message, action, tone });
  } catch (err) {
    // graceful fallback so the playground never hangs on a reaction
    const hasError = /error|traceback|exception/i.test(String(output || ''));
    return res.status(200).json(
      hasError
        ? { message: "There's an error in there — check the message and see which line it points to.", action: 'think', tone: 'fix' }
        : changed
          ? { message: 'Nice — you changed it and it ran! Try pushing it a little further.', action: 'celebrate', tone: 'praise' }
          : { message: 'Try editing a value or a line, then run again to see what changes.', action: 'point', tone: 'nudge' },
    );
  }
}
