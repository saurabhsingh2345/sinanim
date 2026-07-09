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
        // gpt-oss-120b writes far richer lessons than the llama models at the
        // same (free) price; the models API still lists llama as a fallback.
        defaultModel: process.env.LLM_MODEL || 'openai/gpt-oss-120b',
        label: 'Groq',
      };
    case 'openai':
      return {
        base: 'https://api.openai.com/v1',
        key: process.env.OPENAI_API_KEY,
        // strongest widely-available default for lesson quality; overridable
        defaultModel: process.env.LLM_MODEL || 'gpt-4o',
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
const SYSTEM_PROMPT = `You are the author of an animated, narrated, INTERACTIVE coding lesson.
You write BOTH the visuals (an animation timeline) and the voiceover script (narration). The
narration is synthesized to real speech sentence by sentence, and the timeline automatically
stretches so the voice always fits — write narration generously, never worry about durations.
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
- Almost every scene should have a "narration" string: 2-5 full, friendly, conversational
  sentences a great human tutor would say over that moment. Keep each individual sentence under
  ~22 words (they are synthesized one at a time), but NEVER compress the content — more short
  sentences, not fewer words.
- HARD REQUIREMENT: on title, bullets, code, diff, quiz and diagram scenes the narration must be
  at least 2 sentences (aim for 30-70 spoken words). A one-line narration on these scenes is
  invalid output. Across the whole lesson, aim for 350+ spoken words total — a real 2-3 minute
  lesson, not a trailer.
  BAD narration:  "Quick check." / "It's more concise." / "Let's start with an example."
  GOOD narration: "Before we celebrate, let's make sure this clicked. Think about what the
  comprehension actually returns. If you're not sure, that's exactly why we're checking now."
- Narration is plain speech: no code symbols, no markdown, spell things the way you'd SAY them
  ("dot map", "underscore init underscore").
- Never narrate the obvious ("now I type the code"). Narrate the REASONING: why this line, what
  would break without it, what the computer actually does.
- Subtitles are burned in automatically from narration — do NOT duplicate narration as "text" scenes.
- Use "text" scenes only for short punchy on-screen labels (max ~6 words), position "top-center".

TEACHING DEPTH (what separates a great lesson from a slideshow — all four are REQUIRED):
1. MOTIVATE FIRST: open with a concrete, real problem the learner recognizes, not a definition.
2. ONE COMMON MISTAKE: show the wrong (or naive) version first, run or discuss it, then morph it
   into the fix with a "diff" scene while the narration explains exactly why the first version fails.
3. ANSWER "WHY NOT JUST...?": anticipate the obvious alternative a learner would ask about and
   address it head-on in narration (or a quiz).
4. EXPLAIN THE WHY on every code beat: mechanism and consequences, not a readout of the syntax.

SCENE TYPES (every scene needs "startTime" and "duration" in seconds; all accept "narration"):
- title:    { "type":"title", "text":"Python f-strings", "subtitle":"a 60-second tutorial", "startTime":0, "duration":3, "narration":"..." }  — full-screen card; open the video with one and close with one.
- chapter:  { "type":"chapter", "number":1, "text":"Setting up", "startTime":3, "duration":2.5, "narration":"..." }  — section divider card. Use between major sections of longer lessons.
- bullets:  { "type":"bullets", "title":"What you'll learn", "items":["First point","Second point","Third point"], "startTime":5, "duration":6, "narration":"..." }  — full-screen list, points reveal one by one in sync with the voice. 3-5 short items. Great for intros, recaps, and concept summaries.
- diagram:  { "type":"diagram", "title":"Request flow", "nodes":[{"id":"a","label":"Client","x":0.2,"y":0.5},{"id":"b","label":"Server","x":0.5,"y":0.5},{"id":"c","label":"DB","x":0.8,"y":0.5}], "edges":[{"from":"a","to":"b","label":"HTTP"},{"from":"b","to":"c"}], "startTime":11, "duration":7, "narration":"..." }  — animated flowchart. Node x/y are fractions (0..1); spread nodes out, 2-6 nodes.
- viz:      { "type":"viz", "title":"Bubble sort", "vizKind":"array", "steps":[ {"caption":"Compare the first two","array":["5","2","8","1"],"compare":[0,1],"pointers":[{"name":"i","index":0}]}, {"caption":"Swap them","array":["2","5","8","1"],"done":[]}, ... ], "startTime":20, "duration":12, "narration":"..." }  — ANIMATE THE IDEA behind an algorithm, not the code. Each step carries the FULL state; the engine tweens between steps (values pop, pointers glide, stack frames push and pop). Per step you may set: "array" (cell values), "highlight"/"compare"/"done" (index arrays), "pointers" ([{name,index}] labelled arrows that walk the array), "vars" ({name:value} boxes that update, e.g. an accumulator), "stack" (bottom→top frames, for recursion/call stack). 3-8 steps. USE THIS for sorting, searching, two-pointer, loops building a value, and recursion — it makes abstract steps visible. Keep the array ≤ 10 cells. The narration should walk through the steps.
- quote:    { "type":"quote", "text":"Explicit is better than implicit.", "attribution":"The Zen of Python", "startTime":18, "duration":4, "narration":"..." }  — big centered statement.
- bigstat:  { "type":"bigstat", "value":"10x", "label":"faster than the naive version", "startTime":22, "duration":3.5, "narration":"..." }  — one huge number that counts up.
- quiz:     { "type":"quiz", "question":"What does f before a string do?", "options":["Formats it","Freezes it","Makes it faster"], "answerIndex":0, "explanation":"The f prefix enables inline expressions in braces.", "startTime":26, "duration":8, "narration":"Quick check before we move on." }  — interactive checkpoint: the player pauses and waits for the learner's answer. 2-4 options; distractors must be PLAUSIBLE mistakes a real learner makes; the explanation must teach, not just confirm. Include ONE quiz after each key concept.
- challenge: { "type":"challenge", "language":"python", "prompt":"Write a function is_even(n) that returns True for even numbers.", "starterCode":"def is_even(n):\n    # your code here\n    pass", "solution":"def is_even(n):\n    return n % 2 == 0", "tests":[{"expression":"is_even(4)","expected":"True"},{"expression":"is_even(7)","expected":"False"}], "hint":"The modulo operator % gives a remainder.", "concept":"modulo / even numbers", "startTime":30, "duration":12, "narration":"Now it's your turn — give this a real go." }  — a REAL coding challenge (Python or JavaScript only): the player pauses, the learner WRITES code, and it is executed against the tests. Each test's "expression" is evaluated right after the learner's code and its printed value is compared to "expected". Rules: 2-4 tests; "expected" must be EXACTLY what printing that expression produces (e.g. Python True/False, a list like [1, 4, 9]); "starterCode" is a clear scaffold with the signature and a TODO; "solution" must actually pass every test. Include AT MOST ONE challenge, near the end, for a hands-on concept.
- code:     { "type":"code", "language":"python", "code":"...", "title":"main.py", "startTime":3, "duration":5, "narration":"..." }  — the code lands with an animated line cascade (fast and calm, never typed out character by character), then holds while you narrate through it.
- diff:     { "type":"diff", "language":"python", "before":"<full old snippet>", "after":"<full new snippet>", "title":"main.py", "startTime":8, "duration":6, "narration":"..." }  — MAGIC-MOVE morph: unchanged code slides into place, removed lines fade out, new lines land one by one. This is the signature visual — USE IT for every evolution of code you already showed. Never re-show a whole file as a new "code" scene.
- terminal: { "type":"terminal", "output":"...", "prompt":"$ ", "typingSpeed":40, "startTime":14, "duration":3, "sound":true, "narration":"..." }
- text:     { "type":"text", "content":"short label", "position":"top-center", "fadeIn":0.4, "fadeOut":0.4, "startTime":2, "duration":4 }
- click:    { "type":"click", "button":"Run", "startTime":5.5, "duration":0.5, "sound":true }
- wait:     { "type":"wait", "startTime":5, "duration":1, "narration":"..." }  — a beat of pure voiceover.
- highlight:{ "type":"highlight", "startLine":2, "endLine":3, "startTime":6, "duration":2 }  — dims everything but those lines of the current code panel and the camera dives in. Use while narration walks through specific lines.
- mascot:   { "type":"mascot", "action":"point", "line":3, "side":"right", "startTime":6, "duration":3, "narration":"..." }  — Bit, the little studio robot, appears beside the current code panel and ACTS. Actions: "wave" (greets — good on the title card), "point" (extends an arm at "line" N of the visible code while you explain it), "think" (puzzled — good right before revealing a gotcha), "celebrate" (jumps with confetti — after a successful run), "shocked" (recoils — when code errors or the naive version fails). Place 2-4 mascot scenes per lesson at MEANINGFUL moments, overlapping the code scene they refer to. Never random.
- sprite:   { "type":"sprite", "template":"boy", "x":0.5, "y":0.72, "scale":1, "props":{"color":"#22d3ee"}, "animations":[Keyframe], "startTime":0, "duration":4 }

LESSON STRUCTURE (follow unless the request clearly isn't a tutorial):
1. "title" card introducing the topic (narrated welcome; a mascot "wave" is nice here).
2. "bullets" card: the concrete problem this lesson solves + what you'll build (2-4 items).
3. "code" scene with the first version (narrated reasoning). Often the NAIVE version — see depth rule 2.
4. "highlight" + "mascot" point + "wait" while the narration walks through the key lines.
5. "click" Run, then "terminal" showing real output (narrated). Mascot "celebrate" or "shocked" as fits.
6. One or more "diff" scenes evolving the code, each narrating WHY, followed by a run/terminal when it helps.
7. A "quiz" checkpoint after each key concept (at least one per lesson). For a hands-on coding lesson (Python/JS), optionally ONE "challenge" near the end where the learner writes a small function that's tested for real.
8. Use "chapter" cards to divide longer lessons into sections; use "diagram" when an architecture or flow is easier shown than told. When the lesson is about an ALGORITHM or DATA STRUCTURE (sorting, searching, loops that build a value, recursion), include a "viz" scene that animates the steps — it teaches the idea far better than the code alone.
9. Closing "bullets" recap (what was learned + the why) or "title" outro card.

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
- Durations are rough; the engine re-paces everything and stretches scenes to fit the voice.
- Sequence scenes with small gaps. A "click" on Run should come AFTER a code/diff scene and BEFORE terminal output.
- Target 60-120 seconds of content (10-18 scenes). Cover the topic PROPERLY — depth beats brevity.
- Use real, correct, runnable code for the requested language. Terminal output must match what the code actually prints, character for character.
- SELF-CONTAINED: any "code" or "diff" scene that is followed by a "terminal" must be a COMPLETE program that runs on its own — define everything it uses AND include the call/print that produces the shown output. Never show a fragment (a call without its definition) right before a terminal; the code on screen must actually produce that terminal output when run.
- Keep snippets ≤ 16 lines so they fit the panel; evolve them with diffs instead of growing one giant file.
- In "diff" scenes, "before" and "after" are each the COMPLETE snippet, and "before" must exactly equal the code the viewer is currently looking at.
- "backgroundColor" must be "#0b0b10". fps 30, width 1920, height 1080.
- Output ONLY the JSON object. No markdown, no commentary.`;

// ── Critic pass ─────────────────────────────────────────────────────────────────
// A second, cheap LLM round-trip that reviews the draft lesson like a ruthless
// technical editor. It catches wrong code, broken diff chains, shallow
// narration, and weak quizzes — the difference between "generated" and "taught".
const CRITIC_PROMPT = `Now act as a ruthless technical editor. You will receive the animation-timeline
JSON you are reviewing. Return the FULL improved JSON in the exact same schema — no commentary.

REVIEW CHECKLIST, in priority order:
1. CODE CORRECTNESS: every snippet must be real, runnable and idiomatic. Fix bugs. Every
   "terminal" output must be exactly what the preceding code prints. Any code/diff scene
   before a terminal must be SELF-CONTAINED (defines everything it uses + the printing call),
   so it runs on its own and actually produces that output — never a fragment.
2. DIFF INTEGRITY: every "diff".before must EXACTLY equal the code currently on screen (the
   previous "code".code or "diff".after). Repair the chain if broken.
3. COMPLETENESS: the lesson must (a) open with a concrete motivation, (b) contain one
   common-mistake or naive-version diff with narration explaining why it fails, (c) answer one
   "why not just...?" alternative, (d) contain AT LEAST ONE quiz checkpoint after a key
   concept, and (e) close with a recap (bullets). ADD any of these that are missing.
4. NARRATION: every title/bullets/code/diff/quiz/diagram scene needs AT LEAST 2 full sentences
   (30-70 spoken words) of substance — EXPAND thin narration ("Quick check", "It's more
   concise", "Let's run it" are failures: rewrite them with the actual reasoning). The whole
   lesson should total 350+ spoken words. Keep individual sentences under ~22 words, but never
   cut content to get there. Conversational, reasoning not play-by-play, no raw code symbols,
   no filler ("as you can see", "simply", "just").
5. QUIZ: exactly one defensible correct answer, plausible distractors, teaching explanation.
6. MASCOT: actions must land on meaningful beats (point while explaining, shocked on failure,
   celebrate on success). Fix "line" numbers that don't match the visible code.

You are an ENRICHING editor: fix, expand and ADD freely, but only remove a scene when it is
factually wrong or duplicated. The improved lesson must never teach LESS than the draft.
Keep it to ≤ 20 scenes. Return ONLY the improved JSON object.`;

// A dedicated pass that ONLY rewrites narration. Models reliably under-write
// voiceover when juggling the whole timeline; given the single job of "speak
// like a great tutor", they deliver. Everything else in the JSON is untouched.
const NARRATION_PROMPT = `You will receive an animation-timeline JSON for a narrated coding lesson.
Rewrite ONLY the "narration" fields — change NOTHING else (no scene edits, no reordering, no
timing changes, keep every other field byte-identical). Return the FULL JSON.

For every title, bullets, code, diff, quiz and diagram scene, write the voiceover a warm,
sharp human tutor would actually say over that moment: 2-5 sentences, 30-80 spoken words.
- Explain the REASONING: why this code, what breaks without it, what the machine really does.
- On the naive version, foreshadow the problem. On the fix, contrast it with what it replaced.
- On quizzes, frame the stakes of the question without giving the answer away.
- On recaps, connect what was learned back to the opening problem.
- Plain speech only: no code symbols, say things the way you'd SAY them. Each sentence under
  ~22 words. No filler ("as you can see", "simply", "just", "basically").
Short scenes (click, wait, terminal, mascot, text, highlight) may keep one good sentence.
Return ONLY the JSON object.`;

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

/** Critic pass runs on hosted providers; local Ollama stays single-pass (speed).
 *  Set LLM_DEEP=0 to skip everywhere, LLM_DEEP=1 to force it on. */
function criticEnabled(): boolean {
  if (process.env.LLM_DEEP === '0') return false;
  if (process.env.LLM_DEEP === '1') return true;
  return resolveProvider() !== 'ollama';
}

/** Parse a model response into a DSL, retrying the call if the JSON is
 *  malformed or truncated (reasoning models occasionally cut off). */
async function draftDSL(prompt: string, opts: GenerateOptions): Promise<AnimationDSL> {
  let lastErr: unknown;
  for (let tries = 0; tries < 3; tries++) {
    try {
      const content = await chatJSON(
        SYSTEM_PROMPT,
        `Create an animation timeline for: ${prompt}`,
        opts,
      );
      return normalizeDSL(JSON.parse(extractJSON(content)));
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export async function generateDSL(
  prompt: string,
  opts: GenerateOptions = {},
): Promise<AnimationDSL> {
  let dsl = await draftDSL(prompt, opts);

  if (criticEnabled()) {
    try {
      const improved = await chatJSON(
        SYSTEM_PROMPT,
        `${CRITIC_PROMPT}\n\nThe lesson request was: ${prompt}\n\nJSON to review:\n${JSON.stringify(dsl)}`,
        opts,
      );
      dsl = normalizeDSL(JSON.parse(extractJSON(improved)));
    } catch {
      // the draft is already valid — never let the editor pass break generation
    }

    // structural guarantees the prompts alone can't be trusted with: every
    // lesson ships with a quiz checkpoint and a recap. Repair only if missing.
    const missing: string[] = [];
    if (!dsl.scenes.some((s) => s.type === 'quiz')) {
      missing.push(
        'exactly ONE "quiz" scene placed right after the most important concept (plausible distractors, teaching explanation, 2+ sentence narration framing the stakes)',
      );
    }
    const lastCard = [...dsl.scenes].reverse().find((s) => s.type === 'bullets' || s.type === 'title');
    if (!dsl.scenes.some((s) => s.type === 'bullets' && s.startTime > dsl.duration * 0.6) && lastCard?.type !== 'bullets') {
      missing.push(
        'a closing "bullets" recap scene connecting what was learned back to the opening problem',
      );
    }
    // algorithm / data-structure topics teach far better when the steps are
    // animated — guarantee a viz scene for them (the model often forgets).
    const algoRe = /\b(sort|search|recursi\w*|stack|queue|tree|linked list|binary|traver\w*|iterat\w*|\bloop\b|pointer|hash\w*|fibonacci|factorial|bfs|dfs|graph|algorithm|big o|complexity|two pointer|sliding window)\b/i;
    if (algoRe.test(prompt) && !dsl.scenes.some((s) => s.type === 'viz')) {
      missing.push(
        'a "viz" scene that ANIMATES this algorithm step by step — 4-7 steps, each a full state with a caption, using array cells with highlight/compare/done indices, walking pointers ([{name,index}]), an accumulator in vars, and/or a call stack for recursion',
      );
    }
    if (missing.length) {
      try {
        const repaired = await chatJSON(
          SYSTEM_PROMPT,
          `This timeline JSON is missing required scenes. Insert ${missing.join(' and ')}. ` +
            `Change nothing else and return the FULL JSON.\n\nJSON:\n${JSON.stringify(dsl)}`,
          opts,
        );
        const fixed = normalizeDSL(JSON.parse(extractJSON(repaired)));
        if (fixed.scenes.length >= dsl.scenes.length) dsl = fixed;
      } catch {
        // ship without — the lesson still plays
      }
    }
    try {
      const voiced = await chatJSON(
        SYSTEM_PROMPT,
        `${NARRATION_PROMPT}\n\nJSON:\n${JSON.stringify(dsl)}`,
        opts,
      );
      const rich = normalizeDSL(JSON.parse(extractJSON(voiced)));
      // accept only if the pass did its one job: same scenes, more speech
      const wordsOf = (d: AnimationDSL) =>
        d.scenes.reduce((a, s) => a + (s.narration || '').split(/\s+/).filter(Boolean).length, 0);
      if (
        rich.scenes.length === dsl.scenes.length &&
        rich.scenes.every((s, i) => s.type === dsl.scenes[i].type) &&
        wordsOf(rich) > wordsOf(dsl)
      ) {
        dsl = rich;
      }
    } catch {
      // narration stays as-is
    }
  }

  // LEAP 1 — execution grounding: actually run every snippet and replace terminal
  // output with the real thing. Server-side; dynamically imported so the Node-only
  // runner never enters the client bundle. Never let it break generation.
  if (process.env.LLM_GROUND !== '0' && typeof window === 'undefined') {
    try {
      const { groundDSL } = await import('./runner');
      const res = await groundDSL(dsl);
      dsl = res.dsl;
      if (res.grounded || res.failures) {
        console.log(`[ground] ${res.grounded} terminal(s) verified, ${res.failures} showed real errors`);
      }
    } catch {
      // grounding unavailable (no runtime) — ship the model's output as-is
    }
  }
  return repace(dsl);
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
