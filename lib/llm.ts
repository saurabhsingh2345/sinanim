import { AnimationDSL } from './types';
import { normalizeDSL, extractJSON, repace } from './dsl';

// ── Providers ─────────────────────────────────────────────────────────────────
// Groq  → FREE tier, OpenAI-compatible, very fast, runs open models (Llama 3.3).
// OpenAI→ paid, OpenAI-compatible.
// Ollama→ fully local, zero-key fallback so the app always works offline.
//
// Selection: LLM_PROVIDER env wins; otherwise auto-detect by which key exists.

export type Provider = 'groq' | 'openai' | 'ollama';

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

interface ProviderCfg {
  base: string;
  key?: string;
  defaultModel: string;
  label: string;
}

function cfg(p: Provider): ProviderCfg {
  switch (p) {
    case 'groq':
      return {
        base: 'https://api.groq.com/openai/v1',
        key: process.env.GROQ_API_KEY,
        defaultModel: process.env.LLM_MODEL || 'llama-3.3-70b-versatile',
        label: 'Groq',
      };
    case 'openai':
      return {
        base: 'https://api.openai.com/v1',
        key: process.env.OPENAI_API_KEY,
        defaultModel: process.env.LLM_MODEL || 'gpt-4o-mini',
        label: 'OpenAI',
      };
    case 'ollama':
      return {
        base: `${OLLAMA_HOST}/v1`,
        defaultModel: process.env.LLM_MODEL || 'qwen3:8b',
        label: 'Ollama (local)',
      };
  }
}

export function resolveProvider(): Provider {
  const forced = process.env.LLM_PROVIDER?.toLowerCase();
  if (forced === 'groq' || forced === 'openai' || forced === 'ollama') return forced;
  if (process.env.GROQ_API_KEY) return 'groq';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return 'ollama';
}

export const DEFAULT_MODEL = cfg(resolveProvider()).defaultModel;

// ── Prompt ────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a video author for programming tutorials. You write BOTH the
visuals (an animation timeline) and the voiceover script (narration). The narration is
synthesized to real speech and the timeline automatically stretches so the voice always fits —
so write narration generously and do not worry about exact durations.
Convert the user's request into a strict JSON animation timeline. Return JSON ONLY.

TOP-LEVEL SHAPE:
{
  "title": string,
  "fps": 30,
  "width": 1920,
  "height": 1080,
  "backgroundColor": "#0d0d0f",
  "captions": true,
  "scenes": Scene[]
}

NARRATION (the most important part):
- Almost every scene should have a "narration" string: 1-3 friendly, conversational spoken
  sentences a human tutor would say over that moment ("Let's start by defining a function...").
- Narration is plain speech: no code symbols, no markdown, spell things the way you'd SAY them
  ("dot map", "underscore init underscore").
- Subtitles are burned in automatically from narration — do NOT duplicate narration as "text" scenes.
- Use "text" scenes only for short punchy on-screen labels (max ~6 words), position "top-center".

SCENE TYPES (every scene needs "startTime" and "duration" in seconds; all accept "narration"):
- title:    { "type":"title", "text":"Python f-strings", "subtitle":"a 60-second tutorial", "startTime":0, "duration":3, "narration":"..." }  — full-screen card; open the video with one and close with one.
- chapter:  { "type":"chapter", "number":1, "text":"Setting up", "startTime":3, "duration":2.5, "narration":"..." }  — section divider card. Use between major sections of longer lessons.
- bullets:  { "type":"bullets", "title":"What you'll learn", "items":["First point","Second point","Third point"], "startTime":5, "duration":6, "narration":"..." }  — full-screen list, points reveal one by one in sync with the voice. 3-5 short items. Great for intros, recaps, and concept summaries.
- diagram:  { "type":"diagram", "title":"Request flow", "nodes":[{"id":"a","label":"Client","x":0.2,"y":0.5},{"id":"b","label":"Server","x":0.5,"y":0.5},{"id":"c","label":"DB","x":0.8,"y":0.5}], "edges":[{"from":"a","to":"b","label":"HTTP"},{"from":"b","to":"c"}], "startTime":11, "duration":7, "narration":"..." }  — animated flowchart. Node x/y are fractions (0..1); spread nodes out, 2-6 nodes.
- quote:    { "type":"quote", "text":"Explicit is better than implicit.", "attribution":"The Zen of Python", "startTime":18, "duration":4, "narration":"..." }  — big centered statement.
- bigstat:  { "type":"bigstat", "value":"10x", "label":"faster than the naive version", "startTime":22, "duration":3.5, "narration":"..." }  — one huge number that counts up.
- quiz:     { "type":"quiz", "question":"What does f before a string do?", "options":["Formats it","Freezes it","Makes it faster"], "answerIndex":0, "explanation":"The f prefix enables inline expressions in braces.", "startTime":26, "duration":8, "narration":"Quick check before we move on." }  — interactive checkpoint: the player pauses and waits for the learner's answer. 2-4 options, one clearly correct. Include ONE quiz after each key concept.
- code:     { "type":"code", "language":"python", "code":"...", "typingSpeed":18, "title":"main.py", "startTime":3, "duration":5, "narration":"..." }
- diff:     { "type":"diff", "language":"python", "before":"<full old snippet>", "after":"<full new snippet>", "typingSpeed":18, "title":"main.py", "startTime":8, "duration":6, "narration":"..." }  — evolves code on screen: unchanged lines stay, removed lines collapse, new lines are typed. USE THIS whenever you improve/extend code you already showed instead of re-typing the whole file.
- terminal: { "type":"terminal", "output":"...", "prompt":"$ ", "typingSpeed":40, "startTime":14, "duration":3, "sound":true, "narration":"..." }
- text:     { "type":"text", "content":"short label", "position":"top-center", "fadeIn":0.4, "fadeOut":0.4, "startTime":2, "duration":4 }
- click:    { "type":"click", "button":"Run", "startTime":5.5, "duration":0.5, "sound":true }
- wait:     { "type":"wait", "startTime":5, "duration":1, "narration":"..." }  — a beat of pure voiceover.
- highlight:{ "type":"highlight", "startLine":2, "endLine":3, "startTime":6, "duration":2 }  — tints lines of the current code panel while you talk about them.
- sprite:   { "type":"sprite", "template":"boy", "x":0.5, "y":0.72, "scale":1, "props":{"color":"#22d3ee"}, "animations":[Keyframe], "startTime":0, "duration":4 }

LESSON STRUCTURE (follow unless the request clearly isn't a tutorial):
1. "title" card introducing the topic (narrated welcome).
2. "bullets" card previewing what the lesson covers (2-4 items).
3. "code" scene typing the first working version (narrated explanation).
4. Optional "highlight" + "wait" while the narration walks through key lines.
5. "click" Run, then "terminal" showing real output (narrated).
6. One or more "diff" scenes evolving the code further, each followed by a run/terminal when it helps.
7. A "quiz" checkpoint after each key concept (at least one per lesson).
8. Use "chapter" cards to divide longer lessons into sections; use "diagram" when an architecture or flow is easier shown than told.
9. Closing "bullets" recap or "title" card (narrated outro).

SPRITE SCENES (for real-world / character animation, NOT code):
- "template" is one of: boy, ball, cloud, sun, star, ground.
- "x" and "y" are the base position as FRACTIONS of the frame (0..1). x:0.5 is center, y:0 is top, y:1 is bottom.
- boy and ground are anchored at their FEET (their bottom); ball, cloud, sun, star are anchored at their CENTER. Put a character on the floor around y:0.7-0.8.
- "scale" multiplies natural size (1 = natural). "props.color" recolors most templates.
- "animations" is a list of keyframes. Each keyframe:
    { "prop":"y", "from":0.72, "to":0.4, "start":0, "duration":0.4, "easing":"easeOutCubic" }
  where "prop" is one of x, y, scaleX, scaleY, rotation, opacity.
  - x/y are absolute fractions (0..1). scaleX/scaleY are multipliers of scale. rotation is DEGREES. opacity is 0..1.
  - "start"/"duration" are seconds RELATIVE to the scene's own startTime.
  - "easing" is one of linear, easeInOut, easeOutCubic (fast then slow — use for going UP), easeInCubic (slow then fast — use for FALLING), easeOutBack.
  - Keyframes on the same prop apply in order; a later one that has started overrides the earlier one — chain them for multi-step motion.
- AUTOMATIC (do NOT keyframe these yourself): squash & stretch, a ground contact shadow, and the character's limbs (legs tuck at the apex, arms swing up) are all applied automatically from motion. Just keyframe the POSITION (y, and x if it moves sideways) and the motion will look alive.
- A JUMP = a y keyframe up (easeOutCubic) then a y keyframe down (easeInCubic) for a natural gravity arc, e.g.:
    [ {"prop":"y","from":0.75,"to":0.4,"start":0,"duration":0.4,"easing":"easeOutCubic"},
      {"prop":"y","from":0.4,"to":0.75,"start":0.4,"duration":0.4,"easing":"easeInCubic"} ]
  Keep a single jump snappy (~0.8s total). A bounce = several jumps in a row, each a bit lower. A hop across = also add an x keyframe.
- Compose scenes: e.g. a "ground" sprite for the whole video + a "boy" that jumps + optional "cloud"/"sun" in the sky (y:0.15-0.3).
- Use sprite scenes when the request is about people, objects, or physical actions (jumping, bouncing, flying). Use code/terminal scenes only for programming content.

RULES:
- typingSpeed is CHARACTERS PER SECOND. Use 14-24 for code, 30-50 for terminal.
- Make code scenes long enough to finish typing: duration >= (code length / typingSpeed) + 1.
  (Narration may stretch scenes further automatically — that is fine and expected.)
- Sequence scenes with small gaps. A "click" on Run should come AFTER code finishes and BEFORE terminal output.
- Target a 30-60 second tutorial (before narration stretching). Cover the topic properly.
- Use real, correct, runnable code for the requested language. Terminal output must match what the code actually prints.
- In "diff" scenes, "before" and "after" are each the COMPLETE snippet, and "before" must exactly equal the code the viewer is currently looking at.
- "backgroundColor" must be "#0b0b10". fps 30, width 1920, height 1080.
- Output ONLY the JSON object. No markdown, no commentary.`;

export interface GenerateOptions {
  model?: string;
  signal?: AbortSignal;
}

/** Low-level: one system+user round-trip that must return JSON. Used by the
 *  lesson pipeline here and by the course-outline API. */
export async function chatJSON(
  system: string,
  user: string,
  opts: GenerateOptions = {},
): Promise<string> {
  const provider = resolveProvider();
  const c = cfg(provider);
  const model = opts.model || c.defaultModel;
  const content =
    provider === 'ollama'
      ? await callOllama(model, system, user, opts.signal)
      : await callOpenAICompatible(c, model, system, user, opts.signal);
  if (!content) throw new Error(`Empty response from ${c.label}`);
  return content;
}

export async function generateDSL(
  prompt: string,
  opts: GenerateOptions = {},
): Promise<AnimationDSL> {
  const content = await chatJSON(
    SYSTEM_PROMPT,
    `Create an animation timeline for: ${prompt}`,
    opts,
  );
  return repace(normalizeDSL(JSON.parse(extractJSON(content))));
}

// ── OpenAI-compatible (Groq / OpenAI) ───────────────────────────────────────────
async function callOpenAICompatible(
  c: ProviderCfg,
  model: string,
  system: string,
  user: string,
  signal?: AbortSignal,
): Promise<string> {
  if (!c.key) {
    throw new Error(
      `${c.label} API key is missing. Add it to .env.local (get a free Groq key at https://console.groq.com/keys).`,
    );
  }
  const res = await fetch(`${c.base}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${c.key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${c.label} request failed (${res.status}). ${body}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

// ── Ollama (local, native API) ───────────────────────────────────────────────────
async function callOllama(
  model: string,
  system: string,
  user: string,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      model,
      stream: false,
      format: 'json',
      think: false,
      options: { temperature: 0.4, num_ctx: 8192 },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Ollama request failed (${res.status}). Is \`ollama serve\` running and "${model}" pulled? ${body}`,
    );
  }
  const data = await res.json();
  return data?.message?.content ?? '';
}

// ── Model listing / status ────────────────────────────────────────────────────────
export interface ProviderStatus {
  provider: Provider;
  label: string;
  online: boolean;
  models: string[];
  default: string;
  hint?: string;
}

export async function getProviderStatus(): Promise<ProviderStatus> {
  const provider = resolveProvider();
  const c = cfg(provider);

  if (provider === 'ollama') {
    const models = await listOllamaModels();
    return {
      provider,
      label: c.label,
      online: models.length > 0,
      models,
      default: models.includes(c.defaultModel) ? c.defaultModel : models[0] || c.defaultModel,
      hint: models.length
        ? undefined
        : 'Ollama isn\'t reachable. Run `ollama serve` and `ollama pull qwen3:8b`, or add a free GROQ_API_KEY to .env.local.',
    };
  }

  if (!c.key) {
    return {
      provider,
      label: c.label,
      online: false,
      models: [c.defaultModel],
      default: c.defaultModel,
      hint:
        provider === 'groq'
          ? 'Add a free GROQ_API_KEY to .env.local (get one at console.groq.com/keys), then restart.'
          : 'Add your OPENAI_API_KEY to .env.local, then restart.',
    };
  }

  const models = await listOpenAICompatibleModels(c);
  return {
    provider,
    label: c.label,
    online: true,
    models: models.length ? models : [c.defaultModel],
    default: models.includes(c.defaultModel) ? c.defaultModel : c.defaultModel,
  };
}

async function listOllamaModels(): Promise<string[]> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.models ?? []).map((m: any) => m.name).filter(Boolean);
  } catch {
    return [];
  }
}

// A curated shortlist of good free/cheap JSON-capable chat models per provider,
// filtered against what the account actually has access to.
const PREFERRED: Record<string, string[]> = {
  groq: [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'qwen/qwen3-32b',
    'moonshotai/kimi-k2-instruct',
  ],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
};

async function listOpenAICompatibleModels(c: ProviderCfg): Promise<string[]> {
  try {
    const res = await fetch(`${c.base}/models`, {
      headers: { Authorization: `Bearer ${c.key}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const ids: string[] = (data?.data ?? []).map((m: any) => m.id).filter(Boolean);
    const provider = c.base.includes('groq') ? 'groq' : 'openai';
    const preferred = (PREFERRED[provider] || []).filter((m) => ids.includes(m));
    const rest = ids.filter((m) => !preferred.includes(m)).sort();
    return [...preferred, ...rest];
  } catch {
    return [];
  }
}
