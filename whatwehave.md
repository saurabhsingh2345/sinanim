# What We Have — newani (MOTION.dsl)

> Prompt → fully narrated, captioned, interactive coding lesson video. No screen recording, no video editor. An LLM writes the visuals + voiceover script as a JSON DSL, local Kokoro TTS speaks it in the browser, a deterministic canvas renderer draws every frame, and one click exports a publish-ready MP4/WebM.

---

## 1. The Big Picture

```
prompt ──▶ LLM writes DSL + narration (multi-pass) ──▶ Kokoro TTS speaks it (local, free)
       ──▶ timeline auto-paces to the voice ──▶ canvas renders frames + captions + sfx
       ──▶ interactive playback (quizzes, challenges, tinker) ──▶ export .mp4/.webm
```

Re-recording a take becomes "edit one sentence and re-render." The same `renderFrame(ctx, dsl, t)` drives both preview and export, so what you see is exactly what ships.

**Stack:** Next.js 14 (Pages Router) · React 18 · TypeScript · Tailwind · Shiki (syntax colors) · Kokoro TTS (82M, in-browser via WebGPU/WASM) · Canvas 2D · Web Audio · MediaRecorder export · optional FFmpeg remux · optional Pyodide/Judge0 for grading. All open source / zero-cost by default.

---

## 2. Features We Have (Working Today)

### Generation
- **Prompt → single lesson** (`/api/generate-dsl`) or **prompt → full course** (`/api/generate-course` outline, then `/api/generate-lesson` per lesson, generated on demand and cached).
- **Multi-provider LLM** (`lib/llm.ts`): auto-detects Groq (free, fast) → OpenAI → Ollama (fully local, zero-key). Overridable via `LLM_PROVIDER` / `LLM_MODEL`.
- **Multi-pass authoring pipeline**: draft → editor pass → narration-strengthening pass → structural repair (`LLM_DEEP`).
- **Execution grounding** (`lib/runner.ts`, `LLM_GROUND`): LLM-written code is actually run (Python/JS locally, or Judge0 for more languages) and the real output replaces hallucinated terminal output.
- **Recipes** (`lib/recipes.ts`): curriculum templates (Python loops, Web API, CLI, algo-viz, frontend-live…) that steer which scene surfaces the LLM uses per topic.
- **Ready-made scaffolds** (`lib/scaffolds.ts`): gold-standard mini-lessons (Flask API, array.map, Git basics…) loadable from the home page.
- **Visual QA** (`lib/qa.ts`): flags thin lessons, missing quiz/challenge, short narration, missing recap — surfaced as notes to the user.

### The DSL (~25 scene types, `lib/types.ts`)
- **Cards:** `title`, `chapter`, `bullets`, `quote`, `bigstat`, `diagram`, `text`
- **Code:** `code`, `diff` (LCS morph — core tutorial pattern), `terminal`, `highlight`, `click`, `wait`
- **Recording-replacement surfaces:** `ide` (full VS Code: explorer/tabs/editor/terminal with open/create/type/run/highlight steps), `cli`, `browser` (Chrome window with page blocks, search, SERP, docs), `split` (code + live preview), `api` (Postman-style), `pr` (GitHub diff review), `layout` (composite IDE+browser)
- **Teaching:** `viz` (algorithm animation: arrays, pointers, stack frames), `quiz` (interactive checkpoint), `challenge` (real graded coding exercise), `mascot` (Bit the robot), `sprite` (keyframed sprite templates)
- Auto-pacing: durations are minimums; the timeline stretches so the voice always fits (`paceToNarration`).

### Rendering & Audio
- **Deterministic canvas renderer** (`lib/renderer.ts`) — same frame for preview and export; human-like typing jitter with deterministic seeding (`lib/timing.ts`); code morphs (`lib/morph.ts`); camera auto-zoom in IDE scenes (`lib/camera.ts`); easing library (`lib/motion.ts`).
- **6 theme packs** (`lib/themes.ts`): midnight, nord, github-light, solarized, warm-studio, high-contrast — with per-scene overrides.
- **Local TTS** (`lib/tts.ts`, `lib/narration.ts`): Kokoro, 8 curated voices, ~90 MB model downloaded once and cached, sentence-by-sentence synthesis with breath gaps. No key, no cost.
- **Sound engine + conductor** (`lib/sounds.ts`, `lib/conductor.ts`): keystrokes, clicks, whooshes, chimes fired from the timeline, captured into the export.
- **Export** (`lib/export.ts`): `canvas.captureStream()` + MediaRecorder → MP4 (Chrome/Safari) or WebM (Firefox) with narration/captions/sfx baked in. Optional server-side FFmpeg remux (`lib/export-ffmpeg.ts`).

### Interactive Learning ("LEAP" architecture)
1. **Execution grounding** — real output, not guesses (`lib/runner.ts`).
2. **Pause-to-tinker Playground** (`components/Playground.tsx`) — learner edits the on-screen code mid-lesson, runs it (JS iframe sandbox / Pyodide), and Bit reacts to *their* output via `/api/react` (LLM-personalized feedback).
3. **Challenges** (`components/ChallengeCard.tsx`, `/api/grade`) — learner writes code, graded against tests server-side, with Pyodide in-browser fallback; hints + solution reveal.
4. **Concept visualization** — `viz` scenes animate the idea behind the code.
- **Learner model** (`lib/mastery.ts`): FSRS spaced repetition per concept in localStorage; drives the "worth revisiting" list on the home page.

### UI
- **Home** (`pages/index.tsx`): prompt input, model picker, course/lesson mode, template gallery, saved courses, revisit suggestions.
- **Course page** (`pages/course/[id].tsx`): module/lesson sidebar (`CourseSidebar.tsx`), progress bars, per-lesson generation + caching.
- **Player** (`components/Player.tsx`): play/scrub/speed/fullscreen, chapter markers, captions toggle, voice picker, quizzes and challenges as blocking checkpoints, transcript (`Transcript.tsx`), download button.
- **Studio editor** (`components/studio/` — new): full scene-by-scene editor — canvas preview + timeline + per-scene-type inspectors (IDE step sequencer, browser block builder, quiz/challenge editors, theme swatches), live TTS test, add/delete/reorder scenes, DSL-level rewrite via `/api/rewrite-scene`.

### Tooling
- **Headless render scripts** (`scripts/render-*.mts`): frame-grab regression tests for IDE, viz, challenge, mascot, templates, jitter, etc. — the `frame-*.png` files are their outputs.
- `narration-test.mts` / `sound-test.mts` / `generate-sounds.mts` for audio.

### Persistence
- **localStorage only** (`lib/store.ts`): course index, cached lesson DSLs, watch/quiz/challenge progress, FSRS mastery. No server DB, no accounts.

---

## 3. Work In Progress (uncommitted on `main`)

- `components/studio/` — the Studio editor (new, functional, edge cases likely).
- `lib/export-ffmpeg.ts` — FFmpeg WebM→MP4 remux (optional path).
- `pages/api/rewrite-scene.ts` — LLM-powered single-scene rewrite for Studio.
- `lib/recipes.ts`, `lib/scaffolds.ts`, `lib/themes.ts`, `lib/qa.ts`, `lib/sceneMeta.ts` — new supporting modules.
- `lib/piper.ts` — alternative TTS, **stub / never called** (Kokoro is the live path).
- `lib/client-grade.ts` — **redundant duplicate** of `lib/pyodide-grade.ts`; pick one and delete the other.
- The IDE recording-replacement template shipped; more templates are queued in that initiative.

---

## 4. Known Gaps, Breaks & Misses

- **No server persistence** — everything lives in one browser's localStorage (~5–10 MB cap). Clearing site data loses all courses and mastery history.
- **No user accounts / auth / cloud sync** — single-browser, single-player.
- **Export is real-time only** — a 3-minute lesson takes 3 minutes to record (MediaRecorder); no faster-than-realtime or headless batch render pipeline for final video.
- **Grading languages limited** — Python/JS locally; anything else requires a self-hosted Judge0 (`JUDGE0_URL`).
- **Pyodide needs network on first use** — CDN import; no offline fallback.
- **kokoro-js loaded from jsDelivr CDN** in the browser (bundling breaks Next's minifier) — an external runtime dependency and first-load ~90 MB download.
- **English-only narration** (limited to Kokoro's voice set); no localization or audio-description track.
- **Some scene types under-used by the LLM** — `api`, `pr`, `layout` are fully built but rarely generated; recipes could push them harder.
- **Duplicate/orphan code** — `client-grade.ts` vs `pyodide-grade.ts`; `piper.ts` unused.
- **No tests beyond visual frame scripts** — no unit/integration test suite, no CI.
- **`.env.local` is present in the repo folder** — ensure it stays gitignored.

---

## 5. Future Scope (Roadmap Ideas)

### Near-term
- Finish and polish the **Studio editor** (undo/redo, drag-reorder timeline, keyboard shortcuts).
- **More recording-replacement templates** (per the ongoing initiative): mobile-device frame, database/SQL console, notebook (Jupyter), design-tool canvas, Slack/chat mock.
- **Dedupe grading path** (delete `client-grade.ts` or `pyodide-grade.ts`), decide fate of `piper.ts`.
- **Faster-than-realtime export**: headless frame render + FFmpeg mux server-side (the render scripts already prove headless canvas works via `@napi-rs/canvas`).
- Basic **test suite + CI** around `dsl.ts` normalization, `diff.ts`, `timing.ts` determinism.

### Mid-term
- **Accounts + cloud sync** (courses, progress, mastery) — unlocks multi-device and sharing.
- **Shareable/embeddable player** (public lesson URLs, iframe embed).
- **Batch generation** — render a whole course to video files in one go.
- **Subtitle files** (.srt/.vtt export) alongside burned-in captions.
- **More grading languages** via bundled Judge0 or WASM runtimes.

### Long-term
- **LMS / SCORM / xAPI integration**, grade passback, teacher dashboards with class analytics.
- **Collaboration** — shared course editing, comments on scenes.
- **Localization** — multilingual narration (swap TTS engine per language) + translated captions.
- **Marketplace/library** of community scaffolds and recipes.

---

## 5b. Craft Overhaul (2026-07-12) — "Waking the Beast, For Real"

A top-to-bottom quality pass on motion, sound, and template polish. All effects
are `f(t, seed)` and byte-deterministic (verified by `scripts/render-showcase.mts`,
which re-renders each frame and asserts identical PNG hashes across all 14 scaffolds).

- **New OSS deps** (permissive): `gsap`, `popmotion`, `d3-ease`, `jsfxr`,
  `simplex-noise`, `@dagrejs/dagre`, `ghost-cursor`. (magic-move skipped — it needs
  shiki v4; morph.ts already implements the same token-FLIP, so it was enhanced instead.)
- **Motion toolkit** (`lib/motion.ts`): springs (`springValue`), `cubicBezier`,
  back/elastic/bounce eases, `envelopeBack`, nonlinear `staggerCurve`. Deterministic
  RNG + simplex noise + screen-shake in `lib/seedrng.ts`. GSAP seek helper `lib/gsap-seek.ts`.
- **Camera** (`lib/camera.ts`): opt-in cinematic breathing on poster cards (off for
  code), overshoot push-ins, seeded error screen-shake (mascot `shocked`, terminal errors),
  Run-button spring press + double-ring ripple.
- **Transitions** (`lib/transitions.ts`): themed reveals (dissolve/wipe/iris/bars/sweep),
  per-scene defaults, physical slide/push, per-chapter backdrop mood shift, `blendPrevFrame`
  cross-dissolve API. Replaces the old black-overlay stubs.
- **Sound** (`lib/sounds.ts`, `lib/conductor.ts`, `lib/audio-mix.ts`,
  `scripts/generate-sounds.mts`): 8 new synthesized SFX (swish/tick/hover/send/ting/success/
  back) + an 18s ambient **music bed with narration ducking** (`dsl.music`); full
  scene-type coverage (api send/receive, pr line ticks, mascot/challenge stings, card
  swishes); humanized keystrokes + narration crossfades. All CC0 (synthesized).
- **Morph** (`lib/morph.ts`): per-token **color morph** (`fromColor`) + spring landing.
- **Diagram** (`lib/render/diagram-layout.ts`): **dagre auto-layout** (LLM can omit
  x/y via `layout:'auto'`), curved bezier edges, styled arrowheads, ByteByteGo **flow pulses**.
- **Particles** (`lib/particles.ts`): seekable confetti burst (challenge pass / quiz) + spark burst.
- **Bug fixed:** latent `ctx.save` stack leak in `layout` (drawBrowserChrome →
  drawWindowFrame "caller-restores" contract) that made it nondeterministic.

## 6. Quick Reference

| Thing | Where |
|---|---|
| DSL types (all scenes) | `lib/types.ts` |
| Frame renderer | `lib/renderer.ts` |
| LLM providers + prompts | `lib/llm.ts` |
| TTS + pacing | `lib/tts.ts`, `lib/narration.ts` |
| Export | `lib/export.ts`, `lib/export-ffmpeg.ts` |
| Interactive player | `components/Player.tsx` |
| Scene editor | `components/studio/Studio.tsx` |
| Grading | `lib/grade.ts`, `/api/grade`, `lib/pyodide-grade.ts` |
| Learner model (FSRS) | `lib/mastery.ts` |
| Local storage | `lib/store.ts` |
| Env vars | `GROQ_API_KEY`, `OPENAI_API_KEY`, `OLLAMA_HOST`, `LLM_PROVIDER`, `LLM_MODEL`, `LLM_DEEP`, `LLM_GROUND`, `JUDGE0_URL` |
