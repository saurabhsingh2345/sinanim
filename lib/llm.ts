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
const SYSTEM_PROMPT = `You are an animation compiler for programming course videos.
Convert the user's request into a strict JSON animation timeline. Return JSON ONLY.

TOP-LEVEL SHAPE:
{
  "title": string,
  "fps": 30,
  "width": 1920,
  "height": 1080,
  "backgroundColor": "#0d0d0f",
  "scenes": Scene[]
}

SCENE TYPES (every scene needs "startTime" and "duration" in seconds):
- code:     { "type":"code", "language":"python", "code":"...", "typingSpeed":18, "highlightSyntax":true, "cursorVisible":true, "title":"main.py", "startTime":0, "duration":5 }
- terminal: { "type":"terminal", "output":"...", "prompt":"$ ", "typingSpeed":40, "startTime":6, "duration":3, "sound":true }
- text:     { "type":"text", "content":"short caption", "position":"bottom", "fadeIn":0.4, "fadeOut":0.4, "startTime":2, "duration":4 }
- click:    { "type":"click", "button":"Run", "startTime":5.5, "duration":0.5, "sound":true }
- wait:     { "type":"wait", "startTime":5, "duration":1 }
- sprite:   { "type":"sprite", "template":"boy", "x":0.5, "y":0.72, "scale":1, "props":{"color":"#22d3ee"}, "animations":[Keyframe], "startTime":0, "duration":4 }

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
- Sequence scenes with small gaps. A "click" on Run should come AFTER code finishes and BEFORE terminal output.
- Keep total video 10-18 seconds. Keep captions short (max ~8 words).
- Use real, correct, runnable code for the requested language.
- "backgroundColor" must be "#0d0d0f". fps 30, width 1920, height 1080.
- Output ONLY the JSON object. No markdown, no commentary.`;

export interface GenerateOptions {
  model?: string;
  signal?: AbortSignal;
}

export async function generateDSL(
  prompt: string,
  opts: GenerateOptions = {},
): Promise<AnimationDSL> {
  const provider = resolveProvider();
  const c = cfg(provider);
  const model = opts.model || c.defaultModel;
  const content =
    provider === 'ollama'
      ? await callOllama(model, prompt, opts.signal)
      : await callOpenAICompatible(c, model, prompt, opts.signal);

  if (!content) throw new Error(`Empty response from ${c.label}`);
  return repace(normalizeDSL(JSON.parse(extractJSON(content))));
}

// ── OpenAI-compatible (Groq / OpenAI) ───────────────────────────────────────────
async function callOpenAICompatible(
  c: ProviderCfg,
  model: string,
  prompt: string,
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
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Create an animation timeline for: ${prompt}` },
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
  prompt: string,
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
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Create an animation timeline for: ${prompt}` },
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
