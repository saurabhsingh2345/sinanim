# MASTERPLAN — Waking the Sleeping Beast

> Goal: prompt → a **world-class, publish-ready, interactive programming course** with zero manual editing. Not "does the task" — magical. This plan is built from four research tracks (market standard, video/rendering tech, voice tech, LLM pipelines) conducted July 2026, all mapped onto our existing codebase.

---

## 0. The Diagnosis — Why It Feels 10%

| Symptom (your words) | Root cause in the code | The fix (proven tech exists) |
|---|---|---|
| "Code is fast, voice doesn't match" | Typing speed is chars/sec guesswork; narration pacing is scene-level (`paceToNarration` stretches durations), never word-level | **Word-timestamp sync engine** — TTS emits word timings; typing/highlights/captions key off the exact spoken word |
| "Feels robotic and mechanical" | Kokoro is flat-prosody; scripts are written like documentation, not speech; uniform sentence rhythm | Chatterbox Turbo voice tier + **script prosody engineering** + persona + pauses/emphasis + optional 2-voice dialogue |
| "Browser template should be real recording" | `browser` scene is a canvas mockup of Chrome | **Deterministic real-browser capture**: Playwright + virtual time + ghost-cursor → real 60fps page video composited as a scene |
| "Doing the task for the sake of doing it" | Single-shot LLM draft + light repair; no plan, no story, no critic, no taste | **Authoring pipeline 2.0**: planner (concept DAG + running example + persona) → per-scene writers → rubric judges → vision QA loop |
| "I want to avoid editing" | Quality isn't guaranteed, so Studio editing is the safety net | Quality gates (linters, judges, vision QA, audio-pacing checks) so the *first render* is shippable |

**The market lane is open.** Research verdict: avatar platforms (Synthesia/HeyGen) cannot render code; NotebookLM video sync is "early-competent"; Manim-LLM pipelines have no course structure; Scrimba requires human recording. **Nobody does "prompt → complete, interactive, well-paced programming course."** We already have the hardest parts (deterministic renderer, DSL, execution grounding, interactivity). What's missing is craft — sync, voice, story, motion — and every missing piece has a free/open-source solution identified below.

---

## 1. What "World-Class" Means (Market Standard — Measurable Targets)

From the research on Fireship, 3Blue1Brown, ByteByteGo, Wes Bos, Josh Comeau, Scrimba, Brilliant + learning science (Guo et al. 6.9M-session MOOC study, Mayer's multimedia principles, Szpunar interpolated testing):

1. **≤ 6 minutes per lesson video.** Engagement collapses after 6 min regardless of total length. A course = many short lessons, never one long one.
2. **Hook in the first 5 seconds.** Broken program, surprising output, "how does X actually do this?" — never "In this video we will…". No intros, no logos.
3. **Temporal contiguity is king (effect size d≈1.30).** The visual must change at the exact moment the word is spoken. This is our #1 engineering priority and every competitor's weakest point.
4. **Signaling:** auto-highlight the exact token/line being narrated; dim everything else.
5. **Redundancy rule:** never put narration prose on screen. On-screen text = code, labels, keywords only. (Karaoke captions are the exception — they're synced, not redundant.)
6. **Transformations, not slides** (3B1B): morph code, morph diagrams, animate data flowing — never cut between static frames.
7. **Two pacing registers:** "Fireship mode" (dense, fast, witty, 2–5 min) and "Calm mode" (3B1B: deliberate pauses, transformation-heavy, 6–10 min). Chosen per topic difficulty.
8. **Interpolated quizzes every 2–4 minutes** *inside* the flow (proven to reduce mind-wandering), not just at the end.
9. **Worked-example fading across a course:** watch a full example → complete-the-code → build-from-scratch. (PRIMM: Predict–Run–Investigate–Modify–Make as the scene sequence template.)
10. **One running example / fictional product threaded through the whole course.** Never `foo`/`bar`, never yet-another-todo-app. Real library names, real error messages.
11. **Instructor persona with opinions.** Named, consistent, occasionally funny, admits when an API is ugly. "No sense of a person" is the #1 AI-content complaint.
12. **Spaced review:** later lessons open with a 30-second recall of earlier concepts ("Before we start — what does the cleanup function do?"). Almost nobody does this in video; it's cheap for a generator. We already have FSRS (`lib/mastery.ts`) — wire it into generation.
13. **Ship artifacts per lesson:** cheat-sheet card, starter + solution code downloads.
14. **Scrim-style interactivity as the primary product** (MP4 secondary): pause → the frozen frame becomes a live editable editor → run → resume. We generate events (our DSL *is* an event script) — we're structurally better positioned than Scrimba, which needs humans to record.

**AI-slop avoid-list** (learners detect and discount within a paragraph): "delve", "dive into", "it's important to note", "in today's fast-paced world", uniform sentence rhythm, generic examples, recall-only quizzes whose right answer is the only plausible option. All of these become *lint rules*, not vibes.

---

## 2. The Six Pillars (Engineering Program)

### PILLAR A — The Sync Engine (fixes "voice doesn't match") 🔴 highest priority

**Core idea: the word timeline becomes the master clock.** Everything on screen keys off spoken-word indices, not seconds.

1. **Word-level timestamps from TTS.**
   - Swap kokoro-js model to **`onnx-community/Kokoro-82M-v1.0-ONNX-timestamped`** — same Kokoro, but the ONNX graph outputs token durations → word/phoneme timings directly, in-browser. Proven by the **HeadTTS** project (MIT, github.com/met4citizen/HeadTTS, 0.11–0.27 RTF). No aligner needed — we know the exact text.
   - Fallback aligner for voices that don't emit timings: **echogarden** (Node-native forced alignment, returns `wordTimeline`).
2. **New data structure:** `NarrationTimeline = { word, startMs, endMs, sceneId, tokenRef? }[]` produced by `lib/narration.ts`, consumed everywhere.
3. **Rework `lib/timing.ts` + `lib/conductor.ts`:** typing schedules, line reveals, highlight pulses, diagram-node pop-ins are scheduled *against word anchors*. The DSL gains `sync` hints: `{ "highlight": [3,5], "when": "word:closure" }` — "highlight lines 3–5 when the word 'closure' is spoken." The LLM authors these anchors; the renderer honors them exactly.
4. **Typing pace derived from narration:** a code scene's typing duration = the duration of the narration span that describes it (with natural jitter), never a fixed chars/sec. Voice pauses → typing pauses. Voice says "and here's the key line" → cursor arrives at that line on that word.
5. **Karaoke captions:** word-by-word highlighted captions (CapCut style) generated from the same timeline. Logic: port `createTikTokStyleCaptions()` from `@remotion/captions` (~200 lines, groups words into timed "pages"). Also emit `.srt`/`.vtt`, and ASS karaoke (`\k` tags) for ffmpeg burn-in.
6. **Deliberate silence as a first-class DSL beat:** `{"type":"beat","ms":700}` — pause after a reveal ("And the result? … Nothing."). Silence is what makes narration human.
7. **QA check:** deterministic pacing audit — no scene's animation may outrun or lag its narration span by >150ms. Fails the render, triggers repair.

**Files:** `lib/tts.ts`, `lib/narration.ts`, `lib/timing.ts`, `lib/conductor.ts`, `lib/renderer.ts`, `lib/types.ts` (sync anchors), new `lib/word-timeline.ts`.

### PILLAR B — The Voice (fixes "robotic") 🔴

1. **Three-tier TTS engine in `lib/tts.ts`:**
   - **Tier 1 (default, free, browser):** timestamped Kokoro — fast, light, now with word timings.
   - **Tier 2 (quality, free, browser/local):** **Chatterbox Turbo** (Resemble AI, MIT, 350M) — 65.3% preferred over ElevenLabs in blind tests; `exaggeration` knob; `[laugh]`/`[chuckle]` tags; official ONNX + Transformers.js browser demo (~1.5GB, WebGPU). Word timings via echogarden alignment pass.
   - **Tier 3 (paid, optional ceiling):** **ElevenLabs v3** (~$0.90/10min, audio tags `[whispers]`/`[excited]`, native per-word Timing API — zero extra sync work) or **OpenAI gpt-4o-mini-tts** (~$0.15/10min budget option, style instructions, needs aligner).
2. **Prosody-engineered scripts** (LLM-side, works for every tier): contractions mandatory; sentence-length variance enforced ("after any 20+ word sentence, one under 8"); rhetorical questions; direct address; pause markers after reveals; spell out symbols ("arrow function", not "=>"); numbers spelled out. A dedicated "spoken-style rewrite" pass before synthesis.
3. **Emotion arcs:** the DSL narration gains `tone` per scene (`excited | calm | conspiratorial | warning`) mapped to tier-specific controls (Chatterbox exaggeration, ElevenLabs tags, Kokoro speed micro-variance).
4. **Two-voice dialogue mode (differentiator):** teacher + curious student ("wait — why doesn't that break?") right before the payoff. NotebookLM proved dialogue lifts engagement. Implementation: two voices synthesized per-line (Kokoro has 24+ voices; works today), `speaker` field on narration segments. Future GPU tier: Dia-1.6B (Apache-2.0) native dialogue.
5. **Voice cloning (creator tier, later):** Chatterbox zero-shot cloning (MIT, ~10s reference, built-in PerTh watermark = responsible-AI story built in). Require live spoken-consent phrase, keep watermark on.
6. **Music & SFX bed:** curated CC0 pack checked into repo (FreePD music beds, Kenney UI SFX for clicks/whooshes) with license manifest; auto-duck music −12dB under narration; later, Stable Audio Open Small (license OK <$1M revenue) for generated per-course beds. **Avoid MusicGen (weights CC-BY-NC).**

**Files:** `lib/tts.ts` (engine tiers), `lib/narration.ts` (tone, speakers), `lib/llm.ts` (spoken-style pass), new `lib/audio-mix.ts` (music ducking), `public/audio/` (CC0 pack). Delete `lib/piper.ts`.

### PILLAR C — Real Browser Capture (your explicit ask) 🔴

Replace/augment the canvas `browser` mockup with **deterministic recordings of real web pages**:

1. **Engine:** Node script using Playwright/Puppeteer + **virtual time**. Two proven approaches:
   - **CDP `HeadlessExperimental.beginFrame`** (the correct one — same trick Remotion and Replit use; see `puppeteer-capture`, MIT, actively maintained): command Chrome to run exactly one layout→paint→composite cycle per frame, grab the framebuffer. Advances CSS animations and video too.
   - Fallback: Playwright's built-in `page.clock` API (fake Date/timers) + per-frame `page.screenshot()` (timecut/timeweb approach).
   - Never use `Page.startScreencast`/`recordVideo` — 20–30fps, drops frames, non-deterministic.
2. **Scripted interaction timeline:** the LLM authors a `browserrec` scene: `{ url | localHtml, steps: [goto, type(selector, text), click(selector), scroll(to, easing), hover, waitFor] }` with time-stamped events in the *virtual* timeline. Typing dispatches per-keystroke with jitter; scrolling eases.
3. **Human cursor:** inject a DOM cursor element moved along Bézier paths via **ghost-cursor** (MIT) — plus Screen-Studio-style polish: auto-zoom toward click targets, click ripple rings, cursor easing. (These are the exact touches that make Arcade/Screen Studio demos feel premium.)
4. **Sandboxed local pages:** for lessons teaching HTML/CSS/JS, render the *lesson's own code* into a real page and record it — the `split` scene's right pane becomes a real browser render, pixel-perfect.
5. **Output:** PNG frame stream → `ffmpeg -f image2pipe` → MP4 clip, composited into the lesson (either as full-bleed scene or inside our drawn Chrome window frame, keeping brand consistency). Frames land in the same deterministic timeline, so narration sync still holds.
6. **Keep the canvas mockup** as instant-preview fallback and for offline/无-network use; the real capture runs at export/finalize time.
7. **Terminal realism twin:** same philosophy for `cli`/`terminal` — run the actual commands in a real PTY once, record **asciicast JSON** (asciinema format: timestamped ANSI chunks), replay through our canvas terminal with an ANSI parser. Real spinners, real colors, real latency. (Inspiration: VHS by charmbracelet — scripted `.tape` driving a real shell.)

**Files:** new `scripts/capture-browser.mts`, new `lib/browser-capture.ts` (scene type + compositing), `lib/runner.ts` (PTY/asciicast recording), renderer support for video-frame scenes.

### PILLAR D — Cinematic Renderer & Motion (10x the feel) 🟠

1. **Token-level code morphing** — the single biggest visual "wow": adopt **`@shikijs/magic-move` core** (MIT; framework-agnostic `codeToKeyedTokens` + `syncTokenKeys`). It diffs highlighted token streams and assigns stable keys → we interpolate x/y/color/opacity per token on canvas (monospace grid makes math trivial). Replaces line-level `morph.ts` diffs with buttery character-level FLIP animation. `diff`/`code` scenes stop "collapsing lines" and start *evolving code*.
2. **GSAP timelines** (now 100% free incl. all Club plugins since Webflow acquisition, commercial use OK): build one labeled GSAP timeline per scene, `timeline.seek(t)` inside `renderFrame` — deterministic, and we get staggers, springs, CustomEase, choreography-grade motion for free. (MIT-clean alternative: anime.js v4.)
3. **Camera system upgrade** (`lib/camera.ts`): ease-driven pan/zoom with overshoot; auto-zoom to the narrated line; subtle idle drift (1–2% Ken Burns) so no frame is ever fully static; screen-shake-lite on errors; focus pulls between panes in `layout` scenes.
4. **Scene transitions:** match-cut morphs (code block flies from IDE scene into diff scene), wipes synced to narration beats, background gradient shifts per chapter. Never hard cuts between static frames.
5. **Signaling engine:** narration-word-triggered highlights — spoken "this line" → line spotlight + dim rest (Mayer's signaling principle, wired to Pillar A anchors).
6. **Micro-delights:** cursor blink phase-locked to typing pauses, `Run` button depress with shadow, terminal scanline shimmer on output, confetti physics on challenge pass (deterministic seed), Bit's eyes tracking the typing cursor.
7. **Diagram upgrade** (`diagram` scenes): animate *flow* — pulses traveling along edges as narration mentions each component (ByteByteGo's signature); consistent color-coding per concept across the entire course (theme-level concept→color map).

**Files:** `lib/renderer.ts`, `lib/morph.ts` (→ magic-move core), `lib/motion.ts` (→ GSAP), `lib/camera.ts`, `lib/themes.ts` (concept color maps).

### PILLAR E — Authoring Pipeline 2.0 (use the LLM properly) 🔴

Replace draft→edit→polish→repair with a **studio of agents** (all proven patterns: STORM +25% organization, Self-Refine ~20% gain, Refine-n-Judge gating, PreGenie dual-review):

```
   ┌─ COURSE PLANNER ──────────────────────────────────────────────┐
   │ concept DAG (prereqs, Bloom levels) · running example/product │
   │ persona & register (fireship|calm) · misconception list       │
   │ per-lesson story slots: hook, payoff, callback, review-of     │
   └──────────────┬────────────────────────────────────────────────┘
                  ▼  (per scene, parallelizable)
   ┌─ SCENE WRITER ────────────────────────────────────────────────┐
   │ pass 1: free prose beats (unconstrained = better creativity)  │
   │ pass 2: transcode to DSL via STRICT structured outputs        │
   └──────────────┬────────────────────────────────────────────────┘
                  ▼
   ┌─ QUALITY GATES (cheap, fast models, ≠ writer model) ──────────┐
   │ • deterministic DSL linter (timeline overlaps, dangling refs, │
   │   DAG order, one-new-concept-per-scene)                       │
   │ • script lint: forbidden-word regex, sentence-variance,       │
   │   contraction check → targeted sentence rewrites only         │
   │ • rubric judge: binary checklist mirroring LearnLM's 5        │
   │   pedagogy attributes + hook/misconception/callback slots     │
   │ • Refine-n-Judge accept gate (keep old draft if v2 not better)│
   └──────────────┬────────────────────────────────────────────────┘
                  ▼
   ┌─ GROUNDING & RENDER QA ───────────────────────────────────────┐
   │ • execute all code (runner.ts) — real output, always          │
   │ • render 2–4 keyframes per scene + element-bbox sidecar JSON  │
   │ • VLM critique (binary visual checklist, refs element IDs)    │
   │ • audio-pacing audit (narration vs animation duration, ±150ms)│
   │ • patch = DSL *diff*, max 2 iterations, re-render flagged only│
   └───────────────────────────────────────────────────────────────┘
```

Key upgrades in detail:

1. **Concept DAG before anything:** `{concepts: [{id, prereqs, bloom, misconceptions, hook}]}` — validated as a DAG deterministically; topological order drives lesson sequence; "each scene uses ≥1 prior concept" is lintable. Kills disconnected generic examples structurally.
2. **Running example as a state machine:** the planner defines a fictional product (named! e.g., "Brewlog, a coffee-tracking app") whose codebase *evolves* scene by scene; each scene writer receives the example's current state. This is the ByteByteGo/Wes Bos "project spine."
3. **Persona conditioning:** named instructor with opinions, catchphrases, running jokes, and a register preset. Style transfer via named exemplars + pasted sample paragraphs, not adjective lists.
4. **Per-scene strict structured outputs** (Groq `json_schema strict`, Ollama `format`, OpenAI strict) — generate one scene per call, parallelize, repair independently. Delete most of the repair pass. Creative pass unconstrained → constrained transcode (avoids the small-model "constraint tax").
5. **Pedagogy as schema, not prose:** PRIMM slots (`predict` beat → run → investigate → modify challenge), worked-example fading curve as a course-level field, misconception-first beats ("you might expect X… actually Y because Z") required per concept, interpolated quiz placement every 2–4 min enforced by the linter, distractors built from actual misconceptions (from the DAG), spaced-review openers pulling from `lib/mastery.ts` data.
6. **Vision QA loop:** render keyframes (we have headless render scripts already!), overlay element IDs from `sceneMeta`, frontier VLM (Gemini Flash free tier / Llama 4 Maverick on Groq) fills a binary visual checklist, patches emitted as DSL diffs. Critique keyframes, never video (VLMs are bad at motion).
7. **Model assignment (July 2026, cheap/free):** drafting = GPT-OSS-120B on Groq ($0.15/$0.60 per M, ~500 t/s, strict schema); text judge = Llama 3.1 8B Instant ($0.05/$0.08) or Gemini 3 Flash free tier; vision judge = Gemini 3 Flash (free) or Llama 4 Maverick (Groq); local path = Qwen3-32B + Qwen3-VL via Ollama. Groq prompt caching (−50%) fits rubric prompts perfectly.
8. **Sync-anchor authoring:** writers emit word-anchor hints (Pillar A) — "highlight on the word 'closure'" — making temporal contiguity an authored artifact, not luck.

**Files:** `lib/llm.ts` (major refactor → `lib/authoring/` module: planner.ts, writer.ts, judge.ts, lint.ts, vision-qa.ts), `lib/qa.ts` (grows into the gate runner), `lib/course.ts` (DAG), `pages/api/*` (pipeline orchestration + progress streaming to UI).

### PILLAR F — Export & Platform (ship it fast, everywhere) 🟠

1. **Kill real-time export:** **WebCodecs `VideoEncoder` + mediabunny** (MPL-2.0, active; or mp4-muxer, MIT) — loop `t += 1/fps`, render, encode; 5–10x realtime in-browser, hardware-accelerated, muxes the TTS + music audio tracks client-side. MediaRecorder stays as fallback. (~Low effort, huge win — do this first.)
2. **Server/batch renders:** the renderer is pure Canvas 2D → run it on `@napi-rs/canvas` (already a devDependency!) piping raw RGBA into ffmpeg (`-f rawvideo`). Unlocks: render a whole course to MP4s in one command, CI regression renders, faster-than-browser exports. `render:course` script.
3. **Interactive scrim player as the primary artifact:** lessons ship as DSL + audio (tiny, ~1% of video size) played in our player; pause → live editor (Pyodide/sandbox already exist) → "your turn" checkpoints → resume. MP4 becomes the marketing/offline export.
4. **Artifacts per lesson:** auto-generated cheat-sheet (rendered PNG/PDF from a `cheatsheet` scene template), starter+solution code zips, `.srt`/`.vtt` files, chapter markers in MP4 metadata (YouTube chapters from scene beats).
5. **Publish targets:** 16:9 master + 9:16 shorts auto-crop (per-scene safe-area hints in DSL; title/code scenes re-layout for vertical) — every lesson yields 2–3 YouTube Shorts/Reels teasers with karaoke captions, generated from the hook + payoff scenes.

**Files:** `lib/export.ts` (WebCodecs path), `lib/export-ffmpeg.ts`, new `scripts/render-course.mts`, `components/Player.tsx` (scrim mode), new `lib/shorts.ts` (vertical re-layout).

---

## 3. Template-by-Template 10x Plan

Every scene type, what it is today → what makes it magical:

| # | Template | Today | 10x Plan |
|---|---|---|---|
| 1 | **title** | Static text card | Kinetic type-in synced to spoken title words; theme-gradient sweep; SFX sting; auto-generated course "cover art" layout (big type + concept glyph); 9:16 variant |
| 2 | **chapter** | Numbered divider | Progress map — course DAG visualized, current node lights up, prior nodes checked; spoken recall question overlay (spaced review hook) |
| 3 | **bullets** | Lines reveal | Each bullet reveals on its narration word (Pillar A); icon per bullet (Lucide glyph map); prior bullets dim (signaling); never >4 bullets (cognitive load lint) |
| 4 | **code** | Typed at fixed cps | Typing paced by narration span; token-level color morphs (magic-move); narrated-line spotlight; camera drift + zoom to active region; real cursor behaviors (blink phase, momentary selection) |
| 5 | **diff** | Line collapse/add | Full magic-move token FLIP — characters slide/fade to new positions like a human refactor; "before" ghost lingers 300ms; narration anchors trigger each hunk; mistake-first pattern (show broken → error → fix) as a first-class variant |
| 6 | **terminal** | Fake output strings | **Asciicast replay of real PTY sessions** (real ANSI colors, spinners, timing); executed output guaranteed real (runner.ts); jittered keystrokes; prompt/host themed |
| 7 | **cli** | Full-screen fake terminal | Same asciicast engine + VHS-style scripted tapes; multi-command sessions with real latency feel |
| 8 | **ide** | Canvas VS Code | Keep (it's our unfair advantage) + magic-move typing, minimap, git gutter marks, problems panel that clears when the fix lands, camera focus-pulls, narration-anchored line highlights; extensions of the metaphor: test-runner panel going green |
| 9 | **browser** | Canvas Chrome mockup | **Real deterministic browser capture** (Pillar C): real pages, ghost-cursor, auto-zoom on click, ripples; lesson's own HTML rendered *for real*; canvas mockup stays as instant preview |
| 10 | **split** | Code + fake preview | Right pane = real browser render of the left pane's code, updating live as code types (captured deterministically); CSS lessons finally look real |
| 11 | **api** | Postman-style mock | Real HTTP calls at author time (runner-style grounding) → real headers/latency/status; response JSON streams with syntax colors; sequence-diagram inset showing request travel (animated pulse) |
| 12 | **pr** | GitHub diff view | Real `git diff` generated from the running example's evolution; review-comment bubbles appear on narration anchors; CI checks animate pending→green; merge button payoff |
| 13 | **layout** | IDE+browser composite | Focus-pull camera between panes on narration; the browser pane uses real capture; "editor types → preview updates" causality shown with a traveling pulse |
| 14 | **viz** | Array/stack animation | GSAP-choreographed with springs/overshoot; pointer labels speak-synced; step-through paced by narration; more structures: linked list, tree, hash map, recursion tree, event loop, call stack + heap; consistent concept colors from theme |
| 15 | **diagram** | Static nodes+edges | ByteByteGo mode: pulses flow along edges as each component is narrated; progressive disclosure (nodes appear on mention); sketch→clean style toggle; auto-layout (dagre/elk) so LLM never hand-places coordinates |
| 16 | **quiz** | Options + reveal | Interpolated every 2–4 min (lint-enforced); distractors generated from real misconceptions w/ per-distractor feedback; predict-the-output variant (PRIMM) showing real executed answer; low-stakes framing; FSRS recording already wired |
| 17 | **challenge** | Textarea + grade | Monaco/CodeMirror editor with syntax colors; worked→completion→from-scratch fading by course position; progressive hints (nudge → strategy → solution walkthrough as mini-DSL); Bit reacts to *their* code (exists — amplify); confetti on pass |
| 18 | **mascot (Bit)** | Poses | Eyes track typing cursor; reacts to errors (shocked) and passes (celebrate) automatically from scene context; optional student voice in dialogue mode = Bit asks the questions; lip-sync-ish bounce from phoneme timings (HeadTTS gives visemes!) |
| 19 | **sprite** | Template shapes | Keep for metaphors; add physics-ish easing (GSAP), squash & stretch presets; LLM picks metaphors from a curated gallery (lint: no random clipart energy) |
| 20 | **quote/bigstat** | Static | Word-by-word kinetic reveal on narration; count-up eased with tick SFX; source attribution line |
| 21 | **text/wait/click/highlight** | Utility | `beat` (deliberate silence) joins them; click gets ripple + cursor path; highlight becomes narration-anchored spotlight everywhere |
| 22 | **NEW: cheatsheet** | — | Auto-generated end-of-lesson summary card (concepts, snippets, gotchas) rendered as scene + exported PNG/PDF artifact |
| 23 | **NEW: browserrec** | — | The real-capture scene (Pillar C) with scripted steps |
| 24 | **NEW: recall** | — | 30s spaced-review opener quizzing prior lessons' concepts (FSRS-driven) |

---

## 4. The Free/Open-Source Arsenal (vetted licenses)

**Adopt:**
| Tool | For | License | Effort |
|---|---|---|---|
| `onnx-community/Kokoro-82M-v1.0-ONNX-timestamped` + HeadTTS patterns | Word timestamps in-browser | Apache-2.0 / MIT | Low |
| Chatterbox Turbo ONNX (Resemble) | Quality voice tier, cloning, emotion tags | MIT | Medium |
| echogarden | Node forced alignment fallback | check GPL-3.0 (isolate as CLI call) | Low |
| `@shikijs/magic-move` core | Token-level code morphing | MIT | Low-Med |
| GSAP (all plugins free since Webflow acq.) | Timeline choreography, `seek(t)` deterministic | GreenSock Std (free comm.) | Low |
| WebCodecs + mediabunny (or mp4-muxer) | 5–10x realtime in-browser export | MPL-2.0 / MIT | Low |
| @napi-rs/canvas + ffmpeg pipe | Server/batch course rendering | MIT | Medium |
| Playwright/Puppeteer + `HeadlessExperimental.beginFrame` (puppeteer-capture) or `page.clock` | Deterministic real-browser 60fps capture | MIT / BSD | Medium |
| ghost-cursor | Human Bézier mouse paths | MIT | Low |
| asciinema format (+ ANSI parser) | Real terminal replay | MIT-compatible | Low |
| Kenney + FreePD + Pixabay CC0 packs | SFX + music beds | CC0 | Low |
| Instructor / native strict JSON modes (Groq/OpenAI/Ollama) | Structured outputs | MIT | Low |
| dagre or elkjs | Auto-layout diagrams | MIT/EPL | Low |
| CodeMirror 6 | Challenge editor | MIT | Low |

**Reference/steal-ideas-only:** Remotion (paid at our size — architecture reference for parallel export), Motion Canvas/Revideo (MIT; generator-choreography inspiration), VHS (real-shell taping), Code Hike (walkthrough grammar), Screenity/Cap (capture UX), timecut/timeweb (virtual-time shim).

**Avoid:** MusicGen weights (CC-BY-NC), XTTS-v2 (dead non-commercial license), F5-TTS & Fish/OpenAudio weights (non-commercial), Theatre.js (dormant), FFCreator/editly/terminalizer/code-surfer (stale), ffmpeg.wasm (obsolete vs WebCodecs).

---

## 5. Execution Roadmap

### Phase 1 — "It sounds and syncs like a human" (the credibility unlock)
1. Timestamped-Kokoro swap + `NarrationTimeline` (Pillar A.1–2)
2. Word-anchored typing/highlights/captions; `beat` scenes; pacing audit (A.3–7)
3. Spoken-style script rewrite pass + forbidden-word lint (B.2, E script lint)
4. Karaoke captions + srt/vtt export (A.5)
5. WebCodecs export (F.1) — quick win, do in parallel
6. Cleanup: delete `piper.ts`, dedupe `client-grade.ts`

**Exit criterion:** a generated lesson where every highlight/typed line lands on its spoken word, narration has pauses and rhythm, export takes seconds. This alone kills "robotic and mechanical."

### Phase 2 — "It writes like a great teacher" (the content unlock)
1. Course planner: concept DAG + running example + persona + story slots (E.1–3)
2. Per-scene strict structured generation, parallel (E.4)
3. Deterministic DSL linter + rubric judge + accept gate (E gates)
4. Pedagogy schema: PRIMM, misconception beats, interpolated quizzes, fading, recall openers wired to FSRS (E.5, templates 16/17/24)
5. Two pacing registers (fireship/calm) as generation presets

**Exit criterion:** blind-compare a generated lesson vs. Phase-1 output — judges (and you) consistently prefer it; no generic examples, hooks in first 5s, quiz every 2–4 min.

### Phase 3 — "It looks cinematic" (the visual unlock)
1. magic-move token morphs in code/diff/ide (D.1)
2. GSAP timeline choreography + camera upgrade + transitions (D.2–4)
3. Asciicast terminal realism (C.7)
4. Diagram flow-pulses + auto-layout; viz structure expansion (templates 14–15)
5. Music/SFX bed with ducking (B.6)
6. Vision QA loop on keyframes (E.6)

### Phase 4 — "It records the real thing" (the authenticity unlock)
1. Deterministic browser capture engine + `browserrec` scene (Pillar C)
2. Real-render `split` right pane; real API calls in `api`; real git diffs in `pr`
3. Chatterbox Turbo quality voice tier; two-voice dialogue mode (B.1, B.4)
4. Server batch rendering (`render:course`) (F.2)

### Phase 5 — "It's a product, not a demo" (the platform unlock)
1. Scrim-mode player as primary artifact (F.3)
2. Cheat sheets, starter/solution zips, YouTube chapters, 9:16 shorts (F.4–5)
3. Voice cloning creator tier with consent flow (B.5)
4. Accounts/cloud sync, shareable lesson URLs, embeds (from whatwehave.md roadmap)

---

## 6. Success Metrics (so "magical" is measurable)

- **Sync:** 100% of highlight/typing events within ±150ms of their anchor word (automated audit).
- **Length:** every lesson ≤ 6 min; hook before 5s; quiz gap ≤ 4 min (linter-enforced).
- **Slop score:** zero forbidden phrases; sentence-length variance above threshold; named running example present in ≥80% of code scenes.
- **First-render acceptance:** ≥90% of generated lessons pass all gates without human edit (the "avoid editing" goal, quantified).
- **Export:** full lesson MP4 in < 0.2x runtime (WebCodecs), full course batch on server.
- **The blind test:** show 10 devs a Phase-4 lesson next to a human-made YouTube tutorial; ≥half can't tell which was generated.

---

*Companion doc: `whatwehave.md` (current-state inventory). Research conducted 2026-07-10 across market/pedagogy, rendering stacks, voice tech, and LLM pipelines — sources embedded in the respective sections above.*
