// LLM provider plumbing: Groq / OpenAI / Ollama selection, the chatJSON
// round-trip with capability adaptation and backoff, and model listing.
// Prompt content and the lesson pipeline live in lib/llm.ts; the authoring
// stages (lib/authoring/*) import from here so there are no import cycles.
//
// Groq  → FREE tier, OpenAI-compatible, very fast, runs open models.
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
        // gpt-oss-120b writes far richer lessons than the llama models at the
        // same (free) price; the models API still lists llama as a fallback.
        defaultModel: process.env.LLM_MODEL || 'openai/gpt-oss-120b',
        label: 'Groq',
      };
    case 'openai':
      return {
        base: 'https://api.openai.com/v1',
        key: process.env.OPENAI_API_KEY,
        // gpt-4o-mini is the cost-efficient default (~$0.15/$0.60 per M — on par
        // with the Groq default, ~15x cheaper than gpt-4o) and writes solid
        // lessons. Override with LLM_MODEL=gpt-4o for maximum quality.
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

export interface GenerateOptions {
  model?: string;
  signal?: AbortSignal;
  /** Concepts the learner is still weak on (from FSRS, lib/mastery.ts). When set
   *  on a follow-up lesson, the author opens with a "recall" scene reviewing one
   *  of them — spaced review driven by the learner's actual mastery data. */
  reviewConcepts?: string[];
}

/** Low-level: one system+user round-trip that must return JSON. Used by the
 *  lesson pipeline and by the course-outline / rewrite / reaction APIs. */
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

  // Model-capability quirks we adapt to on the fly (newer OpenAI reasoning
  // models reject max_tokens and non-default temperature; some reject JSON mode).
  // `budget` is the completion size; it shrinks if a tier rejects the request as
  // too large (free Groq caps prompt+completion at 8000 tokens/minute).
  // `model` can change if the client sent an id from a different provider.
  const caps = { jsonMode: true, maxTokens: true, temperature: true, budget: 8000, model };

  const attempt = async (): Promise<{ ok: true; content: string } | { ok: false; status: number; body: string }> => {
    const body: Record<string, any> = {
      model: caps.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    };
    if (caps.temperature) body.temperature = 0.4;
    // room for a full lesson; the param name differs on reasoning models
    if (caps.maxTokens) body.max_tokens = caps.budget;
    else body.max_completion_tokens = caps.budget;
    if (caps.jsonMode) body.response_format = { type: 'json_object' };

    const res = await fetch(`${c.base}/chat/completions`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.key}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return { ok: false, status: res.status, body: txt };
    }
    const data = await res.json();
    return { ok: true, content: data?.choices?.[0]?.message?.content ?? '' };
  };

  let r = await attempt();
  // adapt to a rejected parameter / oversized / unknown-model request and retry
  // (OpenAI answers 400 for bad params, 413 for oversize, 404 for a bad model)
  for (let fix = 0; !r.ok && (r.status === 400 || r.status === 413 || r.status === 404) && fix < 5; fix++) {
    const b = r.body.toLowerCase();
    if (b.includes('json_validate_failed') || (b.includes('response_format') && caps.jsonMode)) {
      caps.jsonMode = false; // extractJSON copes with free-form output
    } else if (b.includes('max_tokens') && caps.maxTokens) {
      caps.maxTokens = false; // → max_completion_tokens
    } else if (b.includes('temperature') && caps.temperature) {
      caps.temperature = false; // reasoning models allow only the default
    } else if (r.status === 413 || b.includes('request too large') || b.includes('reduce')) {
      // shrink the completion budget to fit a small per-minute token cap
      const limit = b.match(/limit (\d+)/)?.[1];
      const promptEst = Math.ceil((system.length + user.length) / 3.5);
      caps.budget = Math.max(1200, (limit ? parseInt(limit) : caps.budget) - promptEst - 300);
    } else if ((b.includes('invalid model') || b.includes('model_not_found') || b.includes('does not exist')) && caps.model !== c.defaultModel) {
      // the caller passed a model from another provider (stale UI selection) —
      // fall back to this provider's known-good default instead of failing
      caps.model = c.defaultModel;
    } else break;
    r = await attempt();
  }
  // rate limits / transient upstream errors: back off and retry, honoring the
  // provider's own "try again in Xs" hint (free Groq tier is TPM-limited).
  for (let tries = 0; !r.ok && (r.status === 429 || r.status >= 500) && tries < 4; tries++) {
    const hint = r.body.match(/try again in ([\d.]+)s/i);
    const waitMs = hint ? Math.ceil(parseFloat(hint[1]) * 1000) + 400 : 1500 * (tries + 1);
    await new Promise((res2) => setTimeout(res2, Math.min(waitMs, 12000)));
    r = await attempt();
  }
  if (!r.ok) throw new Error(`${c.label} request failed (${r.status}). ${r.body}`);
  return r.content;
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
  // gpt-4o first: fast enough for a snappy multi-pass author and excellent
  // quality. Stronger (slower) reasoning models follow for when you want them.
  openai: ['gpt-4o', 'gpt-5.2', 'gpt-5.1', 'gpt-5', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o-mini'],
};

async function listOpenAICompatibleModels(c: ProviderCfg): Promise<string[]> {
  try {
    const res = await fetch(`${c.base}/models`, {
      headers: { Authorization: `Bearer ${c.key}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    let ids: string[] = (data?.data ?? []).map((m: any) => m.id).filter(Boolean);
    const provider = c.base.includes('groq') ? 'groq' : 'openai';
    if (provider === 'openai') {
      // keep only chat models — the account also lists embeddings, TTS, image,
      // and legacy completion models that can't author a lesson
      ids = ids.filter(
        (m) => /^(gpt-4|gpt-5|o1|o3|o4|chatgpt)/.test(m) &&
          !/(audio|realtime|transcribe|tts|image|search|moderation)/.test(m),
      );
    }
    const preferred = (PREFERRED[provider] || []).filter((m) => ids.includes(m));
    const rest = ids.filter((m) => !preferred.includes(m)).sort();
    return [...preferred, ...rest];
  } catch {
    return [];
  }
}
