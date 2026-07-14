import { AnimationDSL, PRIMARY_CARD_TYPES } from './types';
import { normalizeDSL, extractJSON, repace } from './dsl';
import { matchRecipe, recipePromptBlock } from './recipes';
import { SPOKEN_STYLE_RULES, lintReport, lintScript } from './script-lint';
import { GenerateOptions, chatJSON, resolveProvider } from './llm-core';
import { LessonPlan, planLesson, planPromptBlock } from './authoring/planner';
import { pickBetter } from './authoring/judge';
import { spokenNarration } from './step-sync';

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
  invalid output. Across the whole lesson, aim for 700+ spoken words total — a real 4-8 minute
  lesson, not a trailer. The ide scene alone should carry 300+ of those words via its per-step
  narrations.
  BAD narration:  "Quick check." / "It's more concise." / "Let's start with an example."
  GOOD narration: "Before we celebrate, let's make sure this clicked. Think about what the
  comprehension actually returns. If you're not sure, that's exactly why we're checking now."
- Narration is plain speech: no code symbols, no markdown, spell things the way you'd SAY them
  ("dot map", "underscore init underscore").
- Never narrate the obvious ("now I type the code"). Narrate the REASONING: why this line, what
  would break without it, what the computer actually does.
- Subtitles are burned in automatically from narration — do NOT duplicate narration as "text" scenes.
- Use "text" scenes only for short punchy on-screen labels (max ~6 words), position "top-center".
- DIALOGUE (optional, use sparingly — at most once or twice per lesson, right before a payoff):
  a curious student can ask the exact question the learner is thinking. Tag speakers inline in the
  narration with [student] and [teacher]; a second voice speaks the student's line. Example:
  "So we call get with a missing key. [student] Wouldn't that throw an error? [teacher] You'd think
  so — but it quietly returns None instead." The markers are stripped from captions automatically.
${SPOKEN_STYLE_RULES}

TEACHING DEPTH (what separates a great lesson from a slideshow — all four are REQUIRED):
1. MOTIVATE FIRST: open with a concrete, real problem the learner recognizes, not a definition.
2. ONE COMMON MISTAKE: show the wrong (or naive) version first inside the "ide" (type → run), then
   fix it with a later type/run or highlight step while narration explains why the first version fails.
   Prefer IDE steps over a separate "diff" scene for this beat.
3. ANSWER "WHY NOT JUST...?": anticipate the obvious alternative a learner would ask about and
   address it head-on in narration (or a quiz).
4. EXPLAIN THE WHY on every code beat: mechanism and consequences, not a readout of the syntax.

CINEMATIC ARC (a lesson is a short film with code, not a slideshow):
1. COLD-OPEN HOOK: the title card's narration IS the hook — a concrete failure, a surprising
   output, or a question the learner has personally hit. Where it fits, follow immediately with
   the problem HAPPENING (an ide type -> run whose output is wrong or ugly) before any theory.
2. ONE PROTAGONIST EXAMPLE: a single running example threads the WHOLE lesson — every scene
   advances or examines it. No disposable one-off snippets.
3. RISING ACTION: the naive attempt visibly fails on screen. Let the failure breathe: a
   "beat" scene and a "shocked" mascot before you explain.
4. THE TURN: explain WHY it failed (viz, or highlight + explain steps), then fix it and run
   again — the green output is the payoff. Celebrate it ("celebrate" mascot, upbeat narration).
5. DENOUEMENT: the quiz checkpoint targets the exact failure from the arc; the recap bullets
   call back to it ("remember when it printed nothing?").
6. CHARACTER: Bit the mascot is a recurring character with a consistent emotional arc
   (wave -> shocked at the failure -> think at the turn -> celebrate the fix), never decoration.
7. CUT RHYTHM: never two static explain cards back to back — return to a full-frame surface
   (ide/cli/browser/viz) between them. Insert a "beat" after every major reveal.

SCENE TYPES (every scene needs "startTime" and "duration" in seconds; all accept "narration"):
- title:    { "type":"title", "text":"Python f-strings", "subtitle":"a 60-second tutorial", "startTime":0, "duration":3, "narration":"..." }  — full-screen card; open the video with one and close with one.
- chapter:  { "type":"chapter", "number":1, "text":"Setting up", "startTime":3, "duration":2.5, "narration":"..." }  — section divider card. Use between major sections of longer lessons.
- bullets:  { "type":"bullets", "title":"What you'll learn", "items":["First point","Second point","Third point"], "startTime":5, "duration":6, "narration":"..." }  — full-screen list, points reveal one by one in sync with the voice. 3-5 short items. Great for intros, recaps, and concept summaries.
- diagram:  { "type":"diagram", "title":"Request flow", "nodes":[{"id":"a","label":"Client","x":0.2,"y":0.5},{"id":"b","label":"Server","x":0.5,"y":0.5},{"id":"c","label":"DB","x":0.8,"y":0.5}], "edges":[{"from":"a","to":"b","label":"HTTP"},{"from":"b","to":"c"}], "startTime":11, "duration":7, "narration":"..." }  — animated flowchart. Node x/y are fractions (0..1); spread nodes out, 2-6 nodes.
- whiteboard:{ "type":"whiteboard", "board":"white", "steps":[ {"narration":"Picture a request leaving your app.","add":[{"kind":"object","src":"laptop.svg","at":[0.2,0.55],"scale":1.2},{"kind":"text","text":"your app","at":[0.2,0.85],"size":40}]}, {"narration":"It travels to the server,","add":[{"kind":"object","src":"cloud.svg","at":[0.55,0.4],"scale":1.1},{"kind":"arrow","from":[0.32,0.52],"to":[0.46,0.42]}]}, {"narration":"which reads from the database and answers.","add":[{"kind":"object","src":"database.svg","at":[0.82,0.55],"scale":1.0},{"kind":"arrow","from":[0.64,0.45],"to":[0.76,0.52]},{"kind":"circle","from":[0.46,0.28],"to":[0.64,0.55]}]} ], "startTime":11, "duration":16, "narration":"Let me draw out how this actually flows." }  — a HAND-DRAWN EXPLAINER: a clean board where handwritten text, imported SVG objects, and sketched arrows/underlines/boxes/circles DRAW ON one at a time behind a marker, each synced to the voice. Use it to build INTUITION for a concept — a mental model, a metaphor, how the pieces relate — the illustrated counterpart to the ide's concrete code. Element kinds: "text"{text,at,size?}, "object"{src,at,scale?}, "arrow"/"underline"/"box"/"circle"/"highlight"(translucent marker swipe to emphasize)/"curve"(bowed arrow){from,to}, "check"/"cross"(a tick or an x){at}. Any element may set "color". Every "at"/"from"/"to" is an [x,y] fraction (0..1) of the frame; spread things out and don't overlap. "board" one of "white"(default)/"blackboard"/"paper". OBJECTS — set "src" to a plain CONCEPT WORD and the engine draws a matching hand-drawn line icon locally (5,000+ icons; no filenames, no need to guess). Use the actor's noun: e.g. "server", "database", "user", "cloud", "browser", "laptop", "rocket", "lock", "key", "shield", "money", "idea", "book", "clock", "target", "git-branch", "chart", "mail", "robot", "package". Any common noun resolves; an unmatched word falls back to a sketched box, so pick a concrete thing. Like "ide", the teaching lives in per-step "narration" (one short spoken line per step, drawn while spoken); the scene-level "narration" is a 1-2 sentence INTRO only. 3-6 steps; label objects with short handwritten "text"; use an arrow/circle to connect or emphasize. Prefer this over "diagram" when you want a warm, narrated, illustrated walkthrough rather than a boxes-and-lines flowchart.
  CRITICAL: every step's "add" MUST contain 1-4 elements, at least one of them an "object" or "text" — the "narration" SAYS it, the "add" DRAWS it. A step with "add":[] paints a BLANK board and is INVALID. Concretely, a DNS lookup whiteboard step looks like {"narration":"The browser asks a resolver.","add":[{"kind":"object","src":"laptop.svg","at":[0.2,0.5]},{"kind":"text","text":"browser","at":[0.2,0.78],"size":36},{"kind":"object","src":"cloud.svg","at":[0.5,0.4]},{"kind":"arrow","from":[0.3,0.48],"to":[0.44,0.42]}]} — pick an object for each actor, label it, and arrow between them. Reuse/keep earlier objects' positions across steps so the picture accumulates.
- viz:      { "type":"viz", "title":"Bubble sort", "vizKind":"array", "steps":[ {"caption":"Compare the first two","array":["5","2","8","1"],"compare":[0,1],"pointers":[{"name":"i","index":0}]}, {"caption":"Swap them","array":["2","5","8","1"],"done":[]}, ... ], "startTime":20, "duration":12, "narration":"..." }  — ANIMATE THE IDEA behind an algorithm, not the code. Each step carries the FULL state; the engine tweens between steps (values pop, pointers glide, stack frames push and pop). Per step you may set: "array" (cell values), "highlight"/"compare"/"done" (index arrays), "pointers" ([{name,index}] labelled arrows that walk the array), "vars" ({name:value} boxes that update, e.g. an accumulator), "stack" (bottom→top frames, for recursion/call stack). 3-8 steps. USE THIS for sorting, searching, two-pointer, loops building a value, and recursion — it makes abstract steps visible. Keep the array ≤ 10 cells. The narration should walk through the steps.
- quote:    { "type":"quote", "text":"Explicit is better than implicit.", "attribution":"The Zen of Python", "startTime":18, "duration":4, "narration":"..." }  — big centered statement.
- bigstat:  { "type":"bigstat", "value":"10x", "label":"faster than the naive version", "startTime":22, "duration":3.5, "narration":"..." }  — one huge number that counts up.
- recall:   { "type":"recall", "concept":"Promises", "source":"from Lesson 2", "question":"What does a Promise represent before it resolves?", "answer":"A pending value — work running now that finishes later.", "startTime":3, "duration":6, "narration":"Quick recall. What does a Promise represent before it resolves? … A pending value." }  — a SPACED-REVIEW opener: pose a question about a PRIOR lesson's concept, hold a breath, then the answer reveals. Use ONE near the very start of a lesson that builds on earlier ones (not lesson 1). The narration must ask the question, pause ("…"), then answer.
- cheatsheet:{ "type":"cheatsheet", "title":"Async/await — cheat sheet", "items":[ {"label":"await","code":"const x = await p","note":"Pauses until the promise settles."}, {"label":"async fn","code":"async () => {}","note":"Always returns a promise."} ], "startTime":60, "duration":10, "narration":"..." }  — an end-of-lesson TAKEAWAY card: 2-6 items, each with a "label" (concept), a short "code" snippet, and a one-line "note" (the gotcha/summary). A designed, screenshot-worthy summary. Prefer this as the CLOSING recap instead of a plain bullets card.
- quiz:     { "type":"quiz", "question":"What does f before a string do?", "options":["Formats it","Freezes it","Makes it faster"], "answerIndex":0, "explanation":"The f prefix enables inline expressions in braces.", "startTime":26, "duration":8, "narration":"Quick check before we move on." }  — interactive checkpoint: the player pauses and waits for the learner's answer. 2-4 options; distractors must be PLAUSIBLE mistakes a real learner makes; the explanation must teach, not just confirm. Include ONE quiz after each key concept.
- challenge: { "type":"challenge", "language":"python", "prompt":"Write a function is_even(n) that returns True for even numbers.", "starterCode":"def is_even(n):\n    # your code here\n    pass", "solution":"def is_even(n):\n    return n % 2 == 0", "tests":[{"expression":"is_even(4)","expected":"True"},{"expression":"is_even(7)","expected":"False"}], "hint":"The modulo operator % gives a remainder.", "concept":"modulo / even numbers", "startTime":30, "duration":12, "narration":"Now it's your turn — give this a real go." }  — a REAL coding challenge (Python or JavaScript only): the player pauses, the learner WRITES code, and it is executed against the tests. Each test's "expression" is evaluated right after the learner's code and its printed value is compared to "expected". Rules: 2-4 tests; "expected" must be EXACTLY what printing that expression produces (e.g. Python True/False, a list like [1, 4, 9]); "starterCode" is a clear scaffold with the signature and a TODO; "solution" must actually pass every test. Include AT MOST ONE challenge, near the end, for a hands-on concept.
- code:     { "type":"code", "language":"python", "code":"...", "title":"main.py", "startTime":3, "duration":5, "narration":"..." }  — the code lands with an animated line cascade (fast and calm, never typed out character by character), then holds while you narrate through it.
- diff:     { "type":"diff", "language":"python", "before":"<full old snippet>", "after":"<full new snippet>", "title":"main.py", "startTime":8, "duration":6, "narration":"..." }  — MAGIC-MOVE morph for short panel evolutions. Prefer evolving code inside an "ide" type/run sequence for full lessons; use "diff" only when a compact before→after panel is clearer than a full IDE.
- terminal: { "type":"terminal", "output":"...", "prompt":"$ ", "typingSpeed":40, "startTime":14, "duration":3, "sound":true, "narration":"..." }  — OUTPUT ONLY. Shows the result of code the learner has ALREADY seen in a preceding "code" or "ide" panel. It renders NO code, so it CANNOT teach or explain code — a terminal by itself is meaningless. Use AT MOST ONE, and only right after a code/ide scene. If you are reaching for a second terminal, you actually want an "ide" scene (type the code, then a "run" step). NEVER build a lesson out of terminal scenes.
- ide:      { "type":"ide", "project":"todo-api", "files":[{"path":"app.py","language":"python"}], "steps":[ {"caption":"Start with the data","action":{"kind":"type","file":"app.py","code":"todos = []\n\ndef add(text):\n    todos.append({'text': text, 'done': False})"}, "narration":"Let's build this from the data up. First an empty list called todos - that's our whole database for now. Then a function, add, that appends a small dictionary: the text we were given, and a done flag that starts as false."}, {"caption":"Why a dictionary?","action":{"kind":"explain","file":"app.py","startLine":4,"endLine":4}, "narration":"Pause on line four for a second. We could have appended just the text string. But the moment we want to mark a todo as finished, we'd have nowhere to put that fact. The dictionary buys us room to grow - every todo carries its own state."}, {"caption":"Try it","action":{"kind":"type","file":"app.py","code":"todos = []\n\ndef add(text):\n    todos.append({'text': text, 'done': False})\n\nadd('ship the demo')\nprint(todos)"}, "narration":"Now let's actually call it. We add one todo - ship the demo - and print the list to see what we've got."}, {"caption":"Run it","action":{"kind":"run","command":"python app.py","output":"[{'text': 'ship the demo', 'done': False}]"}, "narration":"Moment of truth. We run the file."}, {"caption":"Read the output","action":{"kind":"explain","terminal":true}, "narration":"And there it is. One dictionary in the list, exactly the shape we designed: the text we passed in, and done false because nobody has finished it yet. When you can predict the output before you run it, the model in your head matches the machine - that's the goal."} ], "startTime":10, "duration":60, "narration":"..." }  - a FULL VS Code workspace on screen: file explorer + editor tabs + integrated terminal, all evolving. THE FLAGSHIP SURFACE - treat it like a patient teacher at a whiteboard, not a speedrun.
  EVERY STEP CARRIES ITS OWN "narration" (2-4 spoken sentences). The engine starts each step EXACTLY when its first narration sentence is spoken and holds the frame while the voice continues - so long, generous explanations are safe and encouraged. NEVER put the ide teaching text only in the scene-level "narration"; the scene-level narration is at most a 1-2 sentence intro.
  Action kinds: "open" (focus a file tab), "create" (a mouse cursor names a NEW file live), "type" (file + full "code" for that file - successive types on the same file read as edits, so give the WHOLE file each time), "run" (a terminal "command" + its exact "output"; add "creates":["src/App.jsx","index.html"] for a scaffolder like 'npm create vite' so the generated files POP INTO THE FILE TREE — then "open" one and "type" real code into it), "highlight" (glow lines startLine..endLine), "explain" (THE TEACHING BEAT: nothing changes on screen; glow lines startLine..endLine while the voice walks through them, or set "terminal":true to zoom the terminal while the voice reads the output).
  ONE PERSISTENT WORKSPACE: the file tree + every file's contents PERSIST across the whole lesson. STRONGLY PREFER a single "ide" scene with many steps. If you do use a second "ide" scene later, the earlier files and their code are STILL THERE — do NOT retype them from scratch. To keep editing a file, "open" it and "type" the WHOLE file so far (its prior lines + the new ones); the engine shows the old code instantly and types only what's new, in place. To add a brand-new file mid-lesson use "create" (or a "run" with "creates"). Never restart a file from line one when its code already exists.
  THE RHYTHM (mandatory): type a SMALL chunk (3-6 lines) -> "explain" the interesting lines (what they do, why this way, what would break otherwise) -> type the next chunk -> explain -> "run" -> "explain" with terminal:true that interprets the output. Never two type steps in a row without an explain between them. Every "run" is followed by an explain of what the output MEANS.
  8-16 steps is normal; a good ide scene runs 60-120 seconds of speech. List every file a step touches in "files" (path + language; folders come from "/" in the path) - but only if it already exists at the start; files first touched by "create"/"type" pop into the tree live. Keep each file <= ~18 lines and each typed chunk small. Optional "key" per step (a shortcut chip, e.g. "⌘S"). The camera auto-zooms to whatever each step touches.
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
3. "ide" scene — the FLAGSHIP teaching surface. Build the example in a real VS Code workspace using the mandatory rhythm: small type, then explain (glow the lines, teach them), type, explain, run, then explain the output (terminal:true). Per-step "narration" on every step, 2-4 sentences each. This scene should carry MOST of the lesson spoken depth. Prefer "ide" over separate "code"+"terminal" panels.
4. For loops / algorithms / accumulators: a "viz" scene that animates the idea (pointers, vars, array steps).
4b. To build INTUITION for a concept, metaphor, or how components relate (before or after the code): a "whiteboard" scene that draws the mental model out by hand — a warm, narrated alternative to a plain "diagram". At most one per lesson.
5. Optional "api" scene when teaching HTTP/REST/Flask endpoints (Postman-style).
6. A "quiz" checkpoint after the key concept.
7. For Python/JS hands-on topics: ONE "challenge" near the end.
8. Closing recap — prefer a "cheatsheet" card (concept + snippet + gotcha per item); a plain "bullets" recap is the fallback.
9. If the lesson builds on an earlier one, OPEN with a "recall" card reviewing one prior concept before the title.
10. Use "chapter"/"diagram"/"cli"/"browser"/"split"/"layout" when the topic needs those surfaces.
Legacy "code"/"diff"/"terminal" are allowed only when a short panel morph is clearer than a full IDE — never as the default for "teach X".

RULES:
- Durations are rough; the engine re-paces everything and stretches scenes to fit the voice.
- Target a COMPLETE lesson: typically 7-14 scenes, 4-8 minutes of spoken content. Depth beats a thin trailer — a learner should be able to close the video and rebuild the example from memory because every line was EXPLAINED, not just typed.
- Prefer "ide" with a "run" step for coding demos. IDE run "output" must match what the file would print.
- Use real, correct, runnable code. Keep each typed file ≤ ~18 lines.
- SELF-CONTAINED: any runnable snippet (ide type/run or code+terminal) must be a COMPLETE program.
- NEVER teach code through "terminal" scenes. A terminal shows OUTPUT, not code — a lesson built from terminal cards teaches nothing. To teach code you MUST use "ide" (type the code, explain it, then "run"). At most ONE terminal per lesson, only after a code/ide panel. If your draft has two or more terminals, fold them into an ide walkthrough.
- IDE type steps are CUMULATIVE: each "type" step's "code" is the WHOLE file so far (previous lines included), extended with the new lines. Never send only the new chunk — that erases the earlier lines. Small edit-in-place additions still repeat the full file with the new lines appended.
- Keep every IDE file clean, like real code a developer would commit: NEVER repeat a line you already typed, no dead/duplicate statements, logical top-to-bottom order (define before use, except when you are deliberately showing an error). The final file must run and read well.
- In "diff" scenes, "before" must exactly equal the code currently on screen.
- Every "whiteboard" step MUST populate "add" with 1-4 visual elements (objects/text/arrows/etc.) — never emit a whiteboard step with an empty "add". If you can't picture a step, fold it into another step or drop it. Use at most two whiteboard scenes per lesson.
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
5. NARRATION: every title/bullets/cli/browser/viz/quiz/diagram/challenge scene needs AT LEAST 2 full
   sentences (30-70 spoken words). Expand thin narration. Whole lesson 600+ spoken words.
   For ide/browser: narration must match on-screen action (typed code, clicked CTA, SERP result).
6. IDE RHYTHM (the heart of the lesson): EVERY ide step must carry its own "narration" of 2-4
   sentences. Enforce the pattern type -> explain -> type -> explain -> run -> explain(terminal).
   Insert missing "explain" steps (with startLine/endLine on the lines just typed, or
   "terminal":true after a run). Never two consecutive type steps; never a run without an
   output-reading explain after it. Expand any one-liner step narration into real teaching:
   what the line does, why this way, what would break otherwise.
7. QUIZ: one correct answer, plausible distractors, teaching explanation.
8. Keep ≤ 16 scenes. Return ONLY the improved JSON object.`;

// A dedicated pass that ONLY rewrites narration.
const NARRATION_PROMPT = `You will receive an animation-timeline JSON for a narrated coding lesson.
Rewrite ONLY the "narration" fields — change NOTHING else (no scene edits, no reordering, no
timing changes, keep every other field byte-identical). Return the FULL JSON.

For every title, bullets, ide, cli, browser, viz, quiz, diagram, challenge, code, and diff scene, write
the voiceover a warm, sharp human tutor would actually say: 2-5 sentences, 30-80 spoken words.
- Explain the REASONING: why this code, what breaks without it, what the machine really does.
- On IDE/browser scenes: describe exactly what is on screen (typed lines, clicked button, search query, docs section) — captions and voice must agree.
- IDE scenes: rewrite each STEP's own "narration" field (2-4 teaching sentences per step — what
  the line does, why this way, what would break otherwise). The scene-level narration of an ide
  scene is only a 1-2 sentence intro; the steps carry the teaching. Keep the step structure and
  actions byte-identical.
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

// Lean system prompt for text-only edit passes (narration rewrite, lint fix).
// These passes transcribe/refine narration on an ALREADY-VALID lesson — they
// never invent scene types or restructure — so they don't need the full 6k-token
// scene vocabulary. Swapping it here cuts ~11k input tokens per lesson (and the
// output guards reject any pass that breaks structure, so it stays safe).
const LEAN_EDIT_SYSTEM = `You edit an existing narrated-coding-lesson JSON. Keep the EXACT schema, every scene's "type" and order, and every field you are not explicitly asked to change. Do the requested edit only. Return the COMPLETE corrected JSON object and nothing else — no prose, no markdown fences.`;

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

/** Safety net: a whiteboard step with an empty `add` paints a blank board. The
 *  prompt demands real objects/text, but if the model still leaves one empty we
 *  write its narration's key phrase on the board so the beat isn't dead air.
 *  Only fires on non-compliant output; populated steps are untouched. */
function enrichWhiteboards(dsl: AnimationDSL): AnimationDSL {
  const short = (s: string) => {
    const first = (s.split(/[.!?—:]/)[0] || s).trim();
    const w = first.split(/\s+/).slice(0, 6).join(' ');
    return w.length > 34 ? `${w.slice(0, 34).trim()}…` : w;
  };
  for (const scene of dsl.scenes) {
    if (scene.type !== 'whiteboard') continue;
    const textOf = (st: { narration?: string }) => (st.narration || scene.narration || '').trim();
    const total = scene.steps.filter((st) => (!st.add || !st.add.length) && textOf(st)).length;
    if (!total) continue;
    let e = 0;
    scene.steps = scene.steps.map((st) => {
      if (st.add && st.add.length) return st;
      const src = textOf(st);
      if (!src) return st;
      // stack the fallback lines evenly down the board, never overlapping
      const y = total <= 1 ? 0.5 : 0.24 + (e / (total - 1)) * 0.56;
      e++;
      return { ...st, add: [{ kind: 'text', text: short(src), at: [0.5, y], size: total > 4 ? 40 : 46 }] };
    });
  }
  return dsl;
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
    // The critic rewrite + Refine-n-Judge is the single most expensive pass
    // (~20k tokens: full-prompt rewrite + two judge calls). It's the biggest
    // quality lever AND the biggest cost. Skip just this part with LLM_CRITIC=0
    // for a "cheap but good" mode that keeps the plan, structural repairs,
    // narration and lint (which are cheap and high-value).
    if (process.env.LLM_CRITIC !== '0') {
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
    // Terminal soup: a concept lesson carried by terminal/cli cards doesn't
    // teach the code — a bare terminal shows only output, and a wall of cli
    // sessions buries the actual code the learner needs to read. When the topic
    // is an editor/concept lesson (its recipe doesn't sanction cli), force the
    // teaching back into an "ide" walkthrough and drop the redundant panels.
    const recipe = matchRecipe(prompt);
    const recipeAllowsCli = recipe.surfaces.some((s) => s === 'cli');
    const terminalCount = dsl.scenes.filter((s) => s.type === 'terminal').length;
    const cliCount = dsl.scenes.filter((s) => s.type === 'cli').length;
    const ideCount = dsl.scenes.filter((s) => s.type === 'ide').length;
    const termFamily = terminalCount + (recipeAllowsCli ? 0 : cliCount);
    const convertingTerminals =
      terminalCount >= 2 ||
      (terminalCount >= 1 && ideCount === 0 && !dsl.scenes.some((s) => s.type === 'code')) ||
      (!recipeAllowsCli && termFamily >= 2 && ideCount <= 1);
    if (convertingTerminals) {
      const panels = [
        terminalCount ? `${terminalCount} "terminal"` : '',
        !recipeAllowsCli && cliCount ? `${cliCount} "cli"` : '',
      ].filter(Boolean).join(' and ');
      missing.push(
        `a full "ide" walkthrough that carries the teaching and REPLACES the ${panels} scene(s): move the code into an ide scene (type it in small chunks, "explain" each chunk, then "run" once to show the output), then DELETE those standalone terminal/cli scenes — this is a code-concept lesson, so the learner must SEE and read the code in an editor, not just watch commands scroll by. Keep at most one terminal, only right after the ide run`,
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
      // A terminal-soup rewrite is EXPECTED to shrink the scene count (it deletes
      // bare terminals/cli), so don't hold it to the "never lose a scene" rule the
      // insert-missing repairs use — just require it still has real teaching beats.
      try {
        const repaired = await chatJSON(
          SYSTEM_PROMPT,
          `This timeline JSON is missing required scenes. Insert ${missing.join(' and ')}. ` +
            `Change nothing else and return the FULL JSON.\n\nJSON:\n${JSON.stringify(dsl)}`,
          opts,
        );
        const fixed = normalizeDSL(JSON.parse(extractJSON(repaired)));
        const okCount = convertingTerminals
          ? fixed.scenes.filter((s) => PRIMARY_CARD_TYPES.has(s.type)).length >= 2 &&
            fixed.scenes.some((s) => s.type === 'ide')
          : fixed.scenes.length >= dsl.scenes.length;
        if (okCount) dsl = fixed;
      } catch {
        // ship without — the lesson still plays
      }
    }
    try {
      const voiced = await chatJSON(
        LEAN_EDIT_SYSTEM,
        `${NARRATION_PROMPT}\n\nJSON:\n${JSON.stringify(dsl)}`,
        opts,
      );
      const rich = normalizeDSL(JSON.parse(extractJSON(voiced)));
      // accept only if the pass did its one job: same scenes, more speech
      const wordsOf = (d: AnimationDSL) =>
        d.scenes.reduce((a, s) => a + spokenNarration(s).split(/\s+/).filter(Boolean).length, 0);
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
          LEAN_EDIT_SYSTEM,
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

  // Structural visual QA (logged; creators also get this in the Studio UI).
  // Actionable structural notes (missing explain beats, silent steps, missing
  // recap) get ONE repair round — QA that only logs never fixes anything.
  try {
    const { runVisualQA } = await import('./qa');
    const notes = runVisualQA(dsl);
    if (notes.length && !notes[0].startsWith('QA passed')) {
      console.log('[qa]', notes.join(' | '));
      const structural = notes.filter((n) => n.includes('(ide)') || n.includes('recap'));
      if (structural.length && criticEnabled()) {
        try {
          const repaired = await chatJSON(
            SYSTEM_PROMPT,
            `Fix ONLY these structural problems in the lesson JSON below — change nothing else, keep every other scene and field intact, and return the FULL corrected JSON:\n${structural.map((n) => `- ${n}`).join('\n')}\n\nJSON:\n${JSON.stringify(dsl)}`,
            opts,
          );
          const fixed = normalizeDSL(JSON.parse(extractJSON(repaired)));
          if (fixed.scenes.length >= dsl.scenes.length) {
            dsl = fixed;
            const after = runVisualQA(dsl);
            console.log('[qa:repair]', after.length && !after[0].startsWith('QA passed') ? after.join(' | ') : 'clean');
          } else {
            console.log('[qa:repair] rejected — scenes shrank', fixed.scenes.length, '<', dsl.scenes.length);
          }
        } catch (e) {
          // advisory only — ship what we have
          console.log('[qa:repair] failed:', e instanceof Error ? e.message.slice(0, 200) : e);
        }
      }
    }
  } catch {
    // ignore
  }

  // Vision QA (opt-in, LLM_VISION_QA=1): render keyframes headlessly, have a
  // vision model flag visual defects (clipped text, overlap, overflow, dead
  // space), then feed those defects into ONE repair round and RE-CRITIQUE — the
  // fix is accepted only if it doesn't increase the defect count (closed loop).
  if (process.env.LLM_VISION_QA === '1' && typeof window === 'undefined') {
    try {
      const { visionQA } = await import('./authoring/vision-qa');
      const notes = await visionQA(dsl);
      if (notes.length) {
        console.log('[vision-qa]', notes.join(' | '));
        if (criticEnabled()) {
          try {
            const repaired = await chatJSON(
              SYSTEM_PROMPT,
              `A vision model reviewed rendered frames of this lesson and found these VISUAL defects. ` +
                `Fix ONLY the named scenes by adjusting THEIR content — shorten overlong text, reduce item counts, split dense content, remove what overflows — while keeping every scene, its type, its narration, and its teaching intact. Return the FULL corrected JSON:\n` +
                `${notes.map((n) => `- ${n}`).join('\n')}\n\nJSON:\n${JSON.stringify(dsl)}`,
              opts,
            );
            const fixed = normalizeDSL(JSON.parse(extractJSON(repaired)));
            const sameStructure =
              fixed.scenes.length === dsl.scenes.length &&
              fixed.scenes.every((s, i) => s.type === dsl.scenes[i].type);
            if (sameStructure) {
              const after = await visionQA(fixed);
              if (after.length <= notes.length) {
                dsl = fixed;
                console.log('[vision-qa:repair]', after.length ? after.join(' | ') : 'clean');
              } else {
                console.log('[vision-qa:repair] rejected — more defects after', after.length, '>', notes.length);
              }
            } else {
              console.log('[vision-qa:repair] rejected — structure changed');
            }
          } catch (e) {
            console.log('[vision-qa:repair] failed:', e instanceof Error ? e.message.slice(0, 160) : e);
          }
        }
      }
    } catch {
      // advisory only
    }
  }

  return repace(enrichWhiteboards(dsl));
}

// ── Dedicated whiteboard explainer — one cheap call, a designed board ─────────────
// The model does NOT lay out pixels (that produced lazy, all-text boards). It
// returns a BLUEPRINT: which layout fits, the concepts (each with an icon), and
// how they relate. The compiler in lib/whiteboard/compose then places every icon,
// routes edge-to-edge arrows, and reveals each piece with its narration. Brain =
// LLM (semantics); layout = deterministic code (always well spaced, always drawn).
const WHITEBOARD_SYSTEM = `You design ANIMATED hand-drawn whiteboard explainers. Given a TOPIC, think like a great teacher: is this best SHOWN AS MOTION (things that move or happen over time — a ball pushed, water flowing, a request travelling) or as a STRUCTURE (how parts relate — a comparison, a hierarchy, a cycle)? Pick a "mode" and return ONLY a JSON blueprint. You NEVER draw frames or invent pixel timing — a motion engine animates it. Your job is the THINKING: the actors, and what happens.

── MODE "story" (PREFER THIS whenever something MOVES, travels, or changes — physics, cause→effect, a demonstration) ──
{
  "mode":"story", "title":"<short>", "board":"white",
  "intro":"<1 sentence spoken as the title is written>",
  "actors":[ { "id":"ball", "icon":"<concrete noun>", "label":"<short or omit>", "at":[x,y], "scale":1 } ],
  // For a VALUE — a number, variable, array element, stack frame — use "box" INSTEAD of "icon": { "id":"e1", "box":"3", "at":[0.35,0.5] }. The box is drawn with the value inside. Icons are for real-world things (ball, server); boxes are for DATA.
  "beats":[ { "say":"<1-2 spoken sentences>", "do":[ <actions> ] } ]
}
"at" is the STARTING position as [x,y] fractions: x 0=left→1=right, y 0=TOP→1=BOTTOM (so DOWN is larger y). ACTIONS in a beat's "do":
- {"act":"draw","id":"ball"}                         reveal an actor where it stands
- {"act":"move","id":"ball","to":[x,y],"ease":"smooth|accelerate|decelerate|bounce","arc":false}   slide to a point (leaves motion lines; "arc":true bows the path)
- {"act":"push","id":"ball","dir":"left|right|up|down|up-left|up-right|down-left|down-right"}   red FORCE arrow, then it accelerates that way
- {"act":"drop","id":"ball"}                          GRAVITY — falls straight down to the floor, speeding up
- {"act":"throw","id":"ball","to":[x,y],"height":0.25}   PROJECTILE — arcs up then falls to the target (use for anything thrown/launched/falling at an angle)
- {"act":"appear","id":"x"} / {"act":"fade","id":"x"} / {"act":"scale","id":"x","to":1.6} / {"act":"shake","id":"x"}
- {"act":"note","text":"at rest","at":[x,y],"size":36}   handwrite a label
- {"act":"mark","kind":"arrow|curve|circle|highlight|check|cross","from":[x,y],"to":[x,y]}  or {"kind":"check","at":[x,y]}
- {"act":"clear"}                                     WIPE the board (fade every actor + label). Use between distinct sub-ideas so nothing draws over old content. {"act":"clear","ids":["ball"]} clears only those.
EXAMPLE (Newton's 1st law — SHOW it):
{ "mode":"story","title":"Newton's 1st Law","intro":"Things keep doing what they're already doing.",
  "actors":[ {"id":"ball","icon":"ball-football","label":"ball","at":[0.22,0.55]}, {"id":"hand","icon":"hand-stop","at":[0.5,0.8]} ],
  "beats":[
    {"say":"A ball sits still. With no force on it, it stays exactly where it is.","do":[{"act":"draw","id":"ball"},{"act":"note","text":"at rest","at":[0.22,0.78],"size":34}]},
    {"say":"Now give it a push.","do":[{"act":"push","id":"ball","dir":"right"}]},
    {"say":"It keeps rolling on its own, slowing only from friction.","do":[{"act":"move","id":"ball","to":[0.78,0.55],"ease":"decelerate","lines":true}]},
    {"say":"That resistance to change is called inertia.","do":[{"act":"note","text":"inertia","at":[0.5,0.28],"size":50}]}
  ] }

── MODE "diagram" (for STRUCTURE — comparisons, hierarchies, cycles, parts of a whole) ──
{ "mode":"diagram","title":"<short>","layout":"flow|compare|cycle|hub|tree|timeline","intro":"<1 sentence>",
  "nodes":[ {"id":"a","label":"<2-4 words>","icon":"<concrete noun>","say":"<1-2 sentences>","emphasis":"good|bad|key?","group":"left|right? (compare)"} ],
  "links":[ {"from":"a","to":"b","label":"<optional>","style":"arrow|curve"} ] }
Layouts: flow=pipeline/cause-chain, compare=X vs Y (use groups + good/bad), cycle=loop, hub=center+parts (center first), tree=splits into branches, timeline=ordered stages.

RULES (both modes):
- 3-6 actors/nodes. Fewer, well-chosen beats many. Each is EITHER an "icon" (a concrete real-world noun: ball, car, rocket, server, packet, database, engine, lock) OR a "box" (a data value: a number, variable, array cell, stack frame). Use "box" for anything that is DATA/a value — never invent icon names like "number-3".
- SPACE THINGS OUT: keep actors/boxes at least 0.16 apart in x (or 0.2 in y) so they never overlap. A row of array cells sits at e.g. x = 0.30, 0.46, 0.62… A moving item must have empty space to move INTO.
- The teaching is in "say"/"beats" — explain WHY, show the idea happening, don't just name things.
- DIRECTIONS ARE PHYSICAL: y grows DOWNWARD. Gravity/falling → "drop"; thrown/launched/at-an-angle → "throw"; pushed → "push" with the right dir. Don't send things the wrong way.
- KEEP THE BOARD CLEAN: a label/actor stays until you remove it, so DON'T let beats pile drawings on top of each other. Place new elements in EMPTY space, and use {"act":"clear"} (or clear specific ids, or "fade") to retire finished elements before starting a new sub-idea. Every position [x,y] must be clear of what's already there.
- "intro" is spoken ONCE; don't repeat it in a beat.
- Prefer "story" for anything you could act out; use "diagram" for pure structure.
${SPOKEN_STYLE_RULES}
Output ONLY the JSON object — no markdown, no commentary.`;

/** True when the vision self-critique loop should run (costs one VLM call +
 *  possibly a repair). Off by default — opt in per request or with WB_VISION=1. */
function wbVisionOn(opts: GenerateOptions): boolean {
  if ((opts as any).vision != null) return !!(opts as any).vision;
  return process.env.WB_VISION === '1' || process.env.LLM_VISION_QA === '1';
}

const wbDsl = (blueprint: any, topic: string, scene: AnimationDSL['scenes'][number]) =>
  repace(normalizeDSL({ title: blueprint?.title || topic, width: 1920, height: 1080, fps: 30, theme: 'midnight', backgroundColor: '#0b0b10', captions: true, scenes: [scene] }));

/** Ask the model to fix ONLY the visual defects a vision reviewer saw. */
async function repairWhiteboardBlueprint(blueprint: any, issues: string[], opts: GenerateOptions): Promise<any> {
  const user = `Here is your whiteboard blueprint:\n${JSON.stringify(blueprint)}\n\nA reviewer looked at the RENDERED frames and saw these visual problems:\n${issues.map((i) => `- ${i}`).join('\n')}\n\nReturn the CORRECTED blueprint JSON (same schema, same mode). Fix ONLY these: move overlapping or crammed elements into empty space; bring anything off-frame within x,y 0.08..0.92; if drawings pile up across beats add {"act":"clear"} (story) or use fewer nodes; replace any icon that rendered as an empty box with a more common concrete noun; make motion directions physically correct. Keep the teaching identical. Output ONLY the JSON.`;
  return JSON.parse(extractJSON(await chatJSON(WHITEBOARD_SYSTEM, user, opts)));
}

export async function generateWhiteboard(topic: string, opts: GenerateOptions = {}): Promise<AnimationDSL> {
  const { compileWhiteboard } = await import('./whiteboard/compose');
  const user = `TOPIC: ${topic}\n\nDesign the whiteboard blueprint now.`;
  let lastErr: unknown;
  for (let tries = 0; tries < 3; tries++) {
    try {
      const content = await chatJSON(WHITEBOARD_SYSTEM, user, opts);
      const blueprint = JSON.parse(extractJSON(content));
      const scene = compileWhiteboard(blueprint);
      if (!scene.steps.length) throw new Error('empty blueprint');
      let dsl = wbDsl(blueprint, topic, scene);

      // Self-critique loop: the engine LOOKS at its own render and fixes what a
      // vision model flags (overlap, off-frame, clutter, placeholder icons, wrong
      // direction). One repair pass, accepted only if it doesn't make things worse.
      if (wbVisionOn(opts)) {
        try {
          const { whiteboardVisionQA } = await import('./whiteboard/vision');
          const issues = await whiteboardVisionQA(dsl);
          if (issues.length) {
            console.log('[whiteboard-vision]', issues.join(' | '));
            const fixed = await repairWhiteboardBlueprint(blueprint, issues, opts);
            const scene2 = compileWhiteboard(fixed);
            if (scene2.steps.length) {
              const dsl2 = wbDsl(fixed, topic, scene2);
              const after = await whiteboardVisionQA(dsl2);
              if (after.length <= issues.length) { dsl = dsl2; console.log('[whiteboard-vision:repair]', after.length ? after.join(' | ') : 'clean'); }
              else console.log('[whiteboard-vision:repair] rejected — worse');
            }
          }
        } catch (e) {
          console.log('[whiteboard-vision] skipped:', e instanceof Error ? e.message.slice(0, 120) : e);
        }
      }
      return dsl;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

