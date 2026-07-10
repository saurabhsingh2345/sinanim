import { AnimationDSL } from './types';
import { normalizeDSL, extractJSON, repace } from './dsl';
import { matchRecipe, recipePromptBlock } from './recipes';
import { SPOKEN_STYLE_RULES, lintReport, lintScript } from './script-lint';
import { GenerateOptions, chatJSON, resolveProvider } from './llm-core';
import { LessonPlan, planLesson, planPromptBlock } from './authoring/planner';
import { pickBetter } from './authoring/judge';

// Provider plumbing lives in lib/llm-core.ts; re-exported here so existing
// imports (API routes, course.ts) keep working unchanged.
export {
  DEFAULT_MODEL,
  chatJSON,
  getProviderStatus,
  resolveProvider,
} from './llm-core';
export type { GenerateOptions, Provider, ProviderStatus } from './llm-core';

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
  "backgroundColor": "#0b0b10",
  "theme": "midnight",
  "brand": { "name": "Acme", "accent": "#a78bfa" },
  "captions": true,
  "scenes": Scene[]
}

THEME PACKS (pick one per lesson; override per scene with "theme"):
midnight | nord | github-light | solarized | warm-studio | high-contrast
Every scene may also set "transition": "fade"|"slide"|"push"|"zoom"|"none".
Browser/split page surface uses "pageTheme": "light"|"dark" (separate from ThemePack "theme").
Composite multi-surface: layout { "type":"layout", "preset":"ide-browser"|"cli-browser"|"ide-cli"|"ide-only", "focus":0, "regions":[ {"type":"ide",...}, {"type":"browser",...} ] }

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
${SPOKEN_STYLE_RULES}

TEACHING DEPTH (what separates a great lesson from a slideshow — all four are REQUIRED):
1. MOTIVATE FIRST: open with a concrete, real problem the learner recognizes, not a definition.
2. ONE COMMON MISTAKE: show the wrong (or naive) version first inside the "ide" (type → run), then
   fix it with a later type/run or highlight step while narration explains why the first version fails.
   Prefer IDE steps over a separate "diff" scene for this beat.
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
- diff:     { "type":"diff", "language":"python", "before":"<full old snippet>", "after":"<full new snippet>", "title":"main.py", "startTime":8, "duration":6, "narration":"..." }  — MAGIC-MOVE morph for short panel evolutions. Prefer evolving code inside an "ide" type/run sequence for full lessons; use "diff" only when a compact before→after panel is clearer than a full IDE.
- terminal: { "type":"terminal", "output":"...", "prompt":"$ ", "typingSpeed":40, "startTime":14, "duration":3, "sound":true, "narration":"..." }
- ide:      { "type":"ide", "project":"todo-api", "files":[{"path":"app.py","language":"python"},{"path":"models/todo.py","language":"python"}], "steps":[ {"caption":"Define the model","action":{"kind":"type","file":"models/todo.py","code":"class Todo:\n    def __init__(self, text):\n        self.text = text"}}, {"caption":"Wire the route","action":{"kind":"type","file":"app.py","code":"from flask import Flask\napp = Flask(__name__)"}}, {"caption":"Point out the route","action":{"kind":"highlight","file":"app.py","startLine":2,"endLine":2}}, {"caption":"Run it","action":{"kind":"run","command":"python app.py","output":" * Running on http://127.0.0.1:5000"}} ], "startTime":10, "duration":24, "narration":"..." }  — a FULL VS Code workspace on screen: file explorer + editor tabs + integrated terminal, all evolving. Play it with "steps" (each ~one beat, paced to the narration). Action kinds: "open" (focus/create a file tab), "type" (file + full "code" for that file — successive types on the same file read as edits, so give the WHOLE file each time), "run" (a terminal "command" + its exact "output"), "highlight" (glow lines startLine..endLine of a file). List every file a step touches in "files" (path + language; folders come from "/" in the path). USE THIS instead of separate code+terminal scenes when you want to show building a small multi-file project and running it — it replaces a screen recording of the editor. 3-8 steps; keep each file ≤ ~18 lines. Extra action "create" (a mouse cursor names a NEW file live) and optional "key" per step (a shortcut chip, e.g. "⌘S"). The camera auto-zooms to whatever each step touches, so keep steps focused. Only list a file in "files" if it already exists at the start; files first touched by "create"/"type" pop into the tree live.
- cli:      { "type":"cli", "title":"zsh — ~/app", "cwd":"~/app", "commands":[ {"command":"npm create vite@latest my-app","output":"✔ Scaffolded ./my-app"}, {"command":"npm install","output":"added 231 packages in 3s"}, {"command":"npm run dev","output":"VITE ready\n➜ Local: http://localhost:5173/"} ], "startTime":10, "duration":16, "narration":"..." }  — a full-screen TERMINAL session: each command types at the prompt, then its output streams (errors go red, success/urls tinted). Replaces an asciinema recording. 2-6 commands; output must be realistic.
- browser:  { "type":"browser", "url":"https://my-app.dev", "title":"My App", "pageTheme":"light", "tabs":[{"title":"My App","url":"https://my-app.dev","active":true}], "blocks":[ {"kind":"nav","brand":"◆ Acme","links":["Features","Pricing"]}, {"kind":"hero","heading":"Ship faster","sub":"One platform for building web apps.","cta":"Get started"}, {"kind":"card","title":"Fast","body":"Instant hot reload."} ], "clickBlock":1, "startTime":26, "duration":11, "narration":"..." }  — a real Chrome window (tabs, omnibox, lock, page). Block kinds: nav, hero{heading,sub,cta}, button{label,primary}, card{title,body}, text, input{placeholder,value}, image{label}, code{text}, html{html}, search{query,engine}, serp{results:[{title,url,snippet}]}, docs{heading,body,sidebar,active,highlight}. For "look up / docs / download" topics: sequence search → serp → docs (or downloads hero) with authored content — NEVER invent a live scrape. Optional "clickBlock" aims the cursor at that block. Narration must name the on-screen action ("we type the query", "we click the docs result"). 3-6 blocks per scene.
- layout:   { "type":"layout", "preset":"ide-browser", "focus":0, "regions":[ {"type":"ide","project":"app","files":[{"path":"index.html"}],"steps":[{"action":{"kind":"type","file":"index.html","code":"<h1>Hi</h1>"}}]}, {"type":"browser","url":"localhost:3000","pageTheme":"light","blocks":[{"kind":"hero","heading":"Hi"}]} ], "startTime":20, "duration":16, "narration":"..." }  — IDE + browser (or CLI) side by side. Use when showing code and its live result together.
- split:    { "type":"split", "language":"html", "filename":"index.html", "url":"localhost:3000", "steps":[ {"caption":"Add a heading","code":"<h1>Hello</h1>","blocks":[{"kind":"hero","heading":"Hello"}]}, {"caption":"Add a button","code":"<h1>Hello</h1>\n<button>Click me</button>","blocks":[{"kind":"hero","heading":"Hello"},{"kind":"button","label":"Click me"}]} ], "startTime":38, "duration":12, "narration":"..." }  — EDITOR on the left types the code; the LIVE PREVIEW on the right (same block kinds as browser) updates each step. Each step's "code" is the full snapshot and "blocks" is what it renders. Perfect for HTML/CSS/React front-end lessons. 2-4 steps.
- api:      { "type":"api", "method":"POST", "url":"https://api.acme.dev/v1/todos", "requestBody":"{ \\"text\\": \\"Ship it\\" }", "status":201, "statusText":"Created", "response":"{\n  \\"id\\": 42,\n  \\"text\\": \\"Ship it\\"\n}", "startTime":50, "duration":9, "narration":"..." }  — a REST client (like Postman): the URL types, Send is pressed, then the JSON "response" streams under a colored status badge. Use to show an API call and its result. Method one of GET/POST/PUT/DELETE/PATCH.
- pr:       { "type":"pr", "title":"Add input validation", "filename":"auth.py", "language":"python", "before":"<full old file>", "after":"<full new file>", "startTime":50, "duration":12, "narration":"..." }  — a GitHub-style DIFF review: added lines are green, removed lines red, with old/new line numbers and a "+N −M" header, revealed top-to-bottom with the voice. Use to review a change, teach a refactor, or show a bug fix. "before"/"after" are the COMPLETE file contents.
- text:     { "type":"text", "content":"short label", "position":"top-center", "fadeIn":0.4, "fadeOut":0.4, "startTime":2, "duration":4 }
- click:    { "type":"click", "button":"Run", "startTime":5.5, "duration":0.5, "sound":true }
- wait:     { "type":"wait", "startTime":5, "duration":1, "narration":"..." }  — a beat of pure voiceover.
- highlight:{ "type":"highlight", "startLine":2, "endLine":3, "syncWord":"return", "startTime":6, "duration":2 }  — dims everything but those lines of the current code panel and the camera dives in. Use while narration walks through specific lines. "syncWord" (optional but PREFERRED) anchors the highlight to the exact moment that word is spoken in the code scene's narration — pick a distinctive word from the sentence that discusses those lines.
- mascot:   { "type":"mascot", "action":"point", "line":3, "side":"right", "startTime":6, "duration":3, "narration":"..." }  — Bit, the little studio robot, appears beside the current code panel and ACTS. Actions: "wave" (greets — good on the title card), "point" (extends an arm at "line" N of the visible code while you explain it), "think" (puzzled — good right before revealing a gotcha), "celebrate" (jumps with confetti — after a successful run), "shocked" (recoils — when code errors or the naive version fails). Place 2-4 mascot scenes per lesson at MEANINGFUL moments, overlapping the code scene they refer to. Never random.
- sprite:   { "type":"sprite", "template":"boy", "x":0.5, "y":0.72, "scale":1, "props":{"color":"#22d3ee"}, "animations":[Keyframe], "startTime":0, "duration":4 }

LESSON STRUCTURE (DEFAULT — prefer this for coding topics):
1. "title" card introducing the topic.
2. "bullets" card: what you will learn / the concrete problem (2-4 items).
3. "ide" scene — the FLAGSHIP teaching surface. Build the example in a real VS Code workspace with steps that type code AND at least one "run" step with realistic output. Prefer "ide" over separate "code"+"terminal" panels.
4. For loops / algorithms / accumulators: a "viz" scene that animates the idea (pointers, vars, array steps).
5. Optional "api" scene when teaching HTTP/REST/Flask endpoints (Postman-style).
6. A "quiz" checkpoint after the key concept.
7. For Python/JS hands-on topics: ONE "challenge" near the end.
8. Closing "bullets" recap.
9. Use "chapter"/"diagram"/"cli"/"browser"/"split"/"layout" when the topic needs those surfaces.
Legacy "code"/"diff"/"terminal" are allowed only when a short panel morph is clearer than a full IDE — never as the default for "teach X".

RULES:
- Durations are rough; the engine re-paces everything and stretches scenes to fit the voice.
- Target a COMPLETE lesson: typically 7-14 scenes, 2-4 minutes of spoken content. Depth beats a thin trailer.
- Prefer "ide" with a "run" step for coding demos. IDE run "output" must match what the file would print.
- Use real, correct, runnable code. Keep each typed file ≤ ~18 lines.
- SELF-CONTAINED: any runnable snippet (ide type/run or code+terminal) must be a COMPLETE program.
- In "diff" scenes, "before" must exactly equal the code currently on screen.
- SCREEN LOCK: IDE/browser narration must describe exactly what is on screen at that beat — captions and voice agree ("we type range one to five", "we click Downloads"). Do not narrate syntax symbols the learner cannot see; describe the action.
- When the prompt says look up / docs / download: use authored browser scenes (search → serp → docs), never live web fetch.
- "backgroundColor" should match the theme (midnight → "#0b0b10"). Set top-level "theme" to one of the ThemePack ids. fps 30, width 1920, height 1080.
- Output ONLY the JSON object. No markdown, no commentary.`;

// ── Critic pass ─────────────────────────────────────────────────────────────────
const CRITIC_PROMPT = `Now act as a ruthless technical editor. You will receive the animation-timeline
JSON you are reviewing. Return the FULL improved JSON in the exact same schema — no commentary.

REVIEW CHECKLIST, in priority order:
1. CODE CORRECTNESS: every snippet must be real and runnable. Every ide "run" output and
   "terminal" output must match what the code would print. IDE type steps must leave a
   COMPLETE runnable file before a run step.
2. IDE-FIRST: coding lessons should use "ide" (with a run step) rather than bare code+terminal
   panels. Convert thin code/terminal pairs into one ide scene when clearer.
3. COMPLETENESS: open with motivation (title/bullets), teach in ide, include AT LEAST ONE quiz,
   close with a bullets recap. For loops/algorithms include a "viz". For API/HTTP topics include
   an "api" scene. For Python/JS hands-on topics include ONE "challenge".
4. MISTAKE BEAT: prefer showing the naive version as an ide type→run step, then the fix — not a
   mandatory standalone "diff" scene.
5. NARRATION: every title/bullets/ide/cli/browser/viz/quiz/diagram/challenge scene needs AT LEAST 2 full
   sentences (30-70 spoken words). Expand thin narration. Whole lesson 350+ spoken words.
   For ide/browser: narration must match on-screen action (typed code, clicked CTA, SERP result).
6. QUIZ: one correct answer, plausible distractors, teaching explanation.
7. Keep ≤ 16 scenes. Return ONLY the improved JSON object.`;

// A dedicated pass that ONLY rewrites narration.
const NARRATION_PROMPT = `You will receive an animation-timeline JSON for a narrated coding lesson.
Rewrite ONLY the "narration" fields — change NOTHING else (no scene edits, no reordering, no
timing changes, keep every other field byte-identical). Return the FULL JSON.

For every title, bullets, ide, cli, browser, viz, quiz, diagram, challenge, code, and diff scene, write
the voiceover a warm, sharp human tutor would actually say: 2-5 sentences, 30-80 spoken words.
- Explain the REASONING: why this code, what breaks without it, what the machine really does.
- On IDE/browser scenes: describe exactly what is on screen (typed lines, clicked button, search query, docs section) — captions and voice must agree.
- On quizzes, frame the stakes without giving the answer away.
- On recaps, connect what was learned back to the opening problem.
- Plain speech only: no code symbols. Each sentence under ~22 words. No filler.
Short scenes (click, wait, terminal, mascot, text, highlight, api, pr) may keep 1-3 good sentences.
${SPOKEN_STYLE_RULES}
Return ONLY the JSON object.`;

// Targeted fix pass: rewrites ONLY the narration sentences the lint flagged.
const LINT_FIX_PROMPT = `You will receive an animation-timeline JSON and a lint report listing
narration problems. Rewrite ONLY the narration fields of the flagged scenes to fix every issue —
keep the meaning, keep everything else in the JSON byte-identical (scenes, order, timing, code).
${SPOKEN_STYLE_RULES}
Return ONLY the full JSON object.`;

/** Critic pass runs on hosted providers; local Ollama stays single-pass (speed).
 *  Set LLM_DEEP=0 to skip everywhere, LLM_DEEP=1 to force it on. */
function criticEnabled(): boolean {
  if (process.env.LLM_DEEP === '0') return false;
  if (process.env.LLM_DEEP === '1') return true;
  return resolveProvider() !== 'ollama';
}

/** Parse a model response into a DSL, retrying the call if the JSON is
 *  malformed or truncated (reasoning models occasionally cut off). */
async function draftDSL(
  prompt: string,
  opts: GenerateOptions,
  plan?: LessonPlan,
): Promise<AnimationDSL> {
  const recipe = matchRecipe(prompt);
  const user = [
    `Create an animation timeline for: ${prompt}`,
    '',
    plan ? planPromptBlock(plan) : recipePromptBlock(recipe),
  ].join('\n');
  let lastErr: unknown;
  for (let tries = 0; tries < 3; tries++) {
    try {
      const content = await chatJSON(SYSTEM_PROMPT, user, opts);
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
  // ── Plan first (hosted providers): concept DAG, persona, running example,
  // beat sheet. This is where story and specificity come from; the writer is
  // then conditioned on the plan as a contract. Fail-soft: no plan, no problem.
  let plan: LessonPlan | undefined;
  if (criticEnabled()) {
    try {
      plan = await planLesson(prompt, opts);
    } catch {
      // recipes still steer the draft
    }
  }

  let dsl = await draftDSL(prompt, opts, plan);

  if (criticEnabled()) {
    try {
      const improved = await chatJSON(
        SYSTEM_PROMPT,
        `${CRITIC_PROMPT}\n\nThe lesson request was: ${prompt}\n\nJSON to review:\n${JSON.stringify(dsl)}`,
        opts,
      );
      const revision = normalizeDSL(JSON.parse(extractJSON(improved)));
      // Refine-n-Judge: models prefer their own rewrites even when worse, so
      // the revision must beat the draft on a fixed checklist to be accepted.
      dsl = (await pickBetter(dsl, revision, opts)).dsl;
    } catch {
      // the draft is already valid — never let the editor pass break generation
    }

    // structural guarantees the prompts alone can't be trusted with.
    const missing: string[] = [];
    const hasIdeRun = dsl.scenes.some(
      (s) => s.type === 'ide' && s.steps.some((st) => st.action.kind === 'run'),
    );
    const hasCodeTerminal =
      dsl.scenes.some((s) => s.type === 'code') && dsl.scenes.some((s) => s.type === 'terminal');
    if (!hasIdeRun && !hasCodeTerminal) {
      missing.push(
        'an "ide" scene with at least one "run" step (realistic output) that teaches the core concept — prefer ide over bare code+terminal',
      );
    }
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
    const algoRe = /\b(sort|search|recursi\w*|stack|queue|tree|linked list|binary|traver\w*|iterat\w*|\bloop\b|pointer|hash\w*|fibonacci|factorial|bfs|dfs|graph|algorithm|big o|complexity|two pointer|sliding window)\b/i;
    if (algoRe.test(prompt) && !dsl.scenes.some((s) => s.type === 'viz')) {
      missing.push(
        'a "viz" scene that ANIMATES this algorithm step by step — 4-7 steps, each a full state with a caption, using array cells with highlight/compare/done indices, walking pointers ([{name,index}]), an accumulator in vars, and/or a call stack for recursion',
      );
    }
    if (/\b(api|rest|http|flask|express|endpoint|postman)\b/i.test(prompt) && !dsl.scenes.some((s) => s.type === 'api')) {
      missing.push(
        'an "api" scene (Postman-style) showing method, URL, and response for the HTTP concept being taught',
      );
    }
    if (
      /\b(python|javascript|typescript|js\b|coding|function|loop|algorithm)\b/i.test(prompt) &&
      !dsl.scenes.some((s) => s.type === 'challenge')
    ) {
      missing.push(
        'ONE "challenge" near the end (Python or JavaScript): starterCode, solution that passes tests, 2-4 tests with exact expected stdout, and 2+ sentence narration',
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

    // Script lint: catch AI-slop phrases, robotic rhythm, and spoken-symbol
    // problems, then request a TARGETED rewrite of just the flagged sentences.
    const issues = lintScript(dsl);
    if (issues.length) {
      try {
        const fixed = await chatJSON(
          SYSTEM_PROMPT,
          `${LINT_FIX_PROMPT}\n\nLINT REPORT:\n${lintReport(issues)}\n\nJSON:\n${JSON.stringify(dsl)}`,
          opts,
        );
        const clean = normalizeDSL(JSON.parse(extractJSON(fixed)));
        if (
          clean.scenes.length === dsl.scenes.length &&
          clean.scenes.every((s, i) => s.type === dsl.scenes[i].type) &&
          lintScript(clean).length < issues.length
        ) {
          dsl = clean;
        }
      } catch {
        // lint is advisory — never block generation
      }
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

  // Structural visual QA (logged; creators also get this in the Studio UI)
  try {
    const { runVisualQA } = await import('./qa');
    const notes = runVisualQA(dsl);
    if (notes.length && !notes[0].startsWith('QA passed')) {
      console.log('[qa]', notes.join(' | '));
    }
  } catch {
    // ignore
  }

  // Vision QA (opt-in, LLM_VISION_QA=1): render keyframes headlessly and have a
  // vision model flag visual defects (clipped text, overlap, dead space).
  if (process.env.LLM_VISION_QA === '1' && typeof window === 'undefined') {
    try {
      const { visionQA } = await import('./authoring/vision-qa');
      const notes = await visionQA(dsl);
      if (notes.length) console.log('[vision-qa]', notes.join(' | '));
    } catch {
      // advisory only
    }
  }

  return repace(dsl);
}

